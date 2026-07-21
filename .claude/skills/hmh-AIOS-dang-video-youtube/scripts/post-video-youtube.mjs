#!/usr/bin/env node
/**
 * hmh-AIOS-dang-video-youtube
 * Đọc bảng "Đăng video YouTube" trong Lark Base, lấy các dòng Trạng thái = "Chờ đăng",
 * tải file video (attachment) từ Lark, UPLOAD lên YouTube (resumable, OAuth), rồi ghi kết quả
 * (Video ID, Link, Ngày đăng, Trạng thái=Đã đăng / Lỗi) ngược lại vào bảng.
 *
 * Chạy: node post-video-youtube.mjs [--limit N] [--dry-run]
 * Node >= 18, zero-dependency.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Config: đọc file (nếu có) rồi cho ENV ghi đè (chạy trên GitHub Actions không lộ secret).
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.local.json"), "utf8")); } catch { /* CI */ }
const E = process.env;
CFG.larkAppId         = E.LARK_APP_ID              || CFG.larkAppId;
CFG.larkAppSecret     = E.LARK_APP_SECRET          || CFG.larkAppSecret;
CFG.larkDomain        = E.LARK_DOMAIN              || CFG.larkDomain || "https://open.larksuite.com";
CFG.appToken          = E.LARK_BASE_ID            || CFG.appToken;
CFG.tablePost         = E.TABLE_POST              || CFG.tablePost;
CFG.tableChannels     = E.TABLE_CHANNELS          || CFG.tableChannels;
CFG.oauthClientId     = E.YT_OAUTH_CLIENT_ID      || CFG.oauthClientId;
CFG.oauthClientSecret = E.YT_OAUTH_CLIENT_SECRET  || CFG.oauthClientSecret;
CFG.oauthRefreshToken = E.YT_OAUTH_REFRESH_TOKEN  || CFG.oauthRefreshToken;
CFG.defaultCategoryId = E.YT_CATEGORY_ID          || CFG.defaultCategoryId || "22";
CFG.defaultPrivacy    = E.YT_PRIVACY              || CFG.defaultPrivacy || "private";

const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i > -1 ? parseInt(process.argv[i + 1], 10) : (parseInt(E.LIMIT || "", 10) || 0); })();
const DRY = process.argv.includes("--dry-run");
// record_id cụ thể (nút bấm Lark gửi qua client_payload) — CLI --record-id hoặc env RECORD_ID
const RECORD_ID = (() => { const i = process.argv.indexOf("--record-id"); return i > -1 ? process.argv[i + 1] : (E.RECORD_ID || ""); })();
const THUMB_ONLY = /^(1|true|yes)$/i.test(E.THUMB_ONLY || "");
// YT_SYNTHETIC=1 -> tick "Yes" o muc "AI use" (noi dung do AI tao/chinh sua)
const SYNTHETIC = /^(1|true|yes)$/i.test(E.YT_SYNTHETIC || "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Lark ----------
let LK = null, LK_EXP = 0;
async function larkToken() {
  if (LK && Date.now() < LK_EXP) return LK;
  const r = await fetch(`${CFG.larkDomain}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: CFG.larkAppId, app_secret: CFG.larkAppSecret }),
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lark token lỗi: ${j.code} ${j.msg}`);
  LK = j.tenant_access_token; LK_EXP = Date.now() + (j.expire - 120) * 1000;
  return LK;
}
async function larkApi(method, apiPath, body) {
  const token = await larkToken();
  const r = await fetch(`${CFG.larkDomain}${apiPath}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (j.code !== 0) throw new Error(`Lark ${apiPath}: ${j.code} ${j.msg}`);
  return j.data;
}
const T = () => `/open-apis/bitable/v1/apps/${CFG.appToken}/tables/${CFG.tablePost}`;
async function listPending() {
  const out = []; let pt = null;
  do {
    const qs = new URLSearchParams({ page_size: "200" }); if (pt) qs.set("page_token", pt);
    const d = await larkApi("GET", `${T()}/records?${qs}`);
    out.push(...(d.items || [])); pt = d.has_more ? d.page_token : null;
  } while (pt);
  return out;
}
const updateRow = (rid, fields) => larkApi("PUT", `${T()}/records/${rid}`, { fields });

// ---------- Tải attachment (hỗ trợ Base BẬT QUYỀN NÂNG CAO) ----------
// Base bật quyền nâng cao thì /drive/v1/medias/{token}/download bị chặn nếu thiếu query "extra"
// mang thông tin bitablePerm. Ta thử lần lượt nhiều cách, cách nào ra file thật thì dùng.
let FIELD_IDS = null;
async function fieldIds() {
  if (FIELD_IDS) return FIELD_IDS;
  const d = await larkApi("GET", `${T()}/fields?page_size=200`);
  FIELD_IDS = {};
  for (const f of d.items || []) FIELD_IDS[f.field_name] = f.field_id;
  return FIELD_IDS;
}
let APP_REV;
async function appRevision() {
  if (APP_REV !== undefined) return APP_REV;
  try {
    const d = await larkApi("GET", `/open-apis/bitable/v1/apps/${CFG.appToken}`);
    APP_REV = d.app?.revision ?? null;
  } catch { APP_REV = null; }
  return APP_REV;
}
const withExtra = (fileToken, extra) =>
  `${CFG.larkDomain}/open-apis/drive/v1/medias/${fileToken}/download?extra=${encodeURIComponent(JSON.stringify(extra))}`;

/** Các URL tải sẽ thử theo thứ tự: base thường trước, rồi các biến thể "extra" của quyền nâng cao. */
async function downloadUrls(att, recordId, fieldName) {
  const plain = `${CFG.larkDomain}/open-apis/drive/v1/medias/${att.file_token}/download`;
  const urls = [{ label: "không extra", url: plain }];

  // extra dạng attachments: {"bitablePerm":{"tableId":"tbl…","attachments":{"fld…":{"rec…":["box…"]}}}}
  try {
    const fld = (await fieldIds())[fieldName];
    if (fld) urls.push({
      label: "extra=bitablePerm.attachments",
      url: withExtra(att.file_token, {
        bitablePerm: { tableId: CFG.tablePost, attachments: { [fld]: { [recordId]: [att.file_token] } } },
      }),
    });
  } catch { /* không lấy được field id thì bỏ qua cách này */ }

  // extra dạng rev: {"bitablePerm":{"tableId":"tbl…","rev":32}}
  const rev = await appRevision();
  if (rev != null) urls.push({
    label: "extra=bitablePerm.rev",
    url: withExtra(att.file_token, { bitablePerm: { tableId: CFG.tablePost, rev } }),
  });

  // URL Lark trả sẵn trong record (thường đã kèm sẵn extra hợp lệ)
  for (const [label, u] of [["att.url", att.url], ["att.tmp_url", att.tmp_url]]) {
    if (u && !urls.some((x) => x.url === u)) urls.push({ label, url: u });
  }
  return urls;
}

async function downloadAttachment(att, recordId, fieldName, destPath) {
  const token = await larkToken();
  const errs = [];
  for (const { label, url } of await downloadUrls(att, recordId, fieldName)) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    // Lỗi quyền được Lark trả về dạng JSON (dù status có thể là 200), file thật là binary.
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || ct.includes("application/json")) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = `${j.code} ${j.msg}`; } catch { /* body không phải JSON */ }
      errs.push(`${label}: ${msg}`);
      continue;
    }
    await new Promise((res, rej) => {
      const ws = fs.createWriteStream(destPath);
      Readable.fromWeb(r.body).pipe(ws); ws.on("finish", res); ws.on("error", rej);
    });
    const size = fs.statSync(destPath).size;
    if (size === 0) { errs.push(`${label}: file 0 byte`); continue; }
    if (label !== "không extra") console.log(`  (tải qua ${label} — Base đang bật quyền nâng cao)`);
    return size;
  }
  throw new Error(
    `Tải video từ Lark thất bại. Đã thử ${errs.length} cách: ${errs.join(" | ")}. ` +
    `Nếu Base bật QUYỀN NÂNG CAO, hãy vào Base > Quyền nâng cao và cấp quyền xem/tải cho app (bot) đang dùng.`
  );
}

// ---------- YouTube OAuth + upload ----------
async function ytAccessToken(refreshToken) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CFG.oauthClientId, client_secret: CFG.oauthClientSecret,
      refresh_token: refreshToken || CFG.oauthRefreshToken, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Lấy access_token lỗi: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function uploadToYouTube(accessToken, filePath, fileSize, snippet, status) {
  // 1) init resumable
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(fileSize),
      "X-Upload-Content-Type": "video/*",
    },
    body: JSON.stringify({ snippet, status }),
  });
  if (init.status !== 200) throw new Error(`Init upload lỗi ${init.status}: ${await init.text()}`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("Không nhận được upload URL (Location).");
  // 2) PUT toàn bộ bytes (1 lần)
  const buf = fs.readFileSync(filePath);
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "video/*", "Content-Length": String(fileSize) },
    body: buf,
  });
  const j = await put.json();
  if (!j.id) throw new Error(`Upload lỗi: ${JSON.stringify(j.error || j)}`);
  return j.id;
}

// ---------- MAIN ----------
// Đặt ảnh bìa (thumbnail) cho video đã upload.
// LƯU Ý: kênh phải ĐÃ XÁC MINH (số điện thoại) thì YouTube mới cho đặt thumbnail tuỳ chỉnh.
// Tach tag thong minh: uu tien dau phay; neu khong co phay thi tach theo khoang trang/xuong dong
// (ho tro kieu "#Tag1 #Tag2"). Bo dau #, loai tag > 100 ky tu, cat tong <= 480 ky tu (YouTube gioi han 500).
function parseTags(raw) {
  const s = (raw ?? "").toString().trim();
  if (!s) return [];
  let parts = s.includes(",") ? s.split(",") : s.split(/[\n\r\s]+/);
  parts = parts.map((x) => x.trim().replace(/^#+/, "")).filter(Boolean);
  const dropped = parts.filter((x) => x.length > 100);
  if (dropped.length) console.log(`  [canh bao] bo ${dropped.length} tag dai qua 100 ky tu`);
  parts = parts.filter((x) => x.length <= 100);
  const out = []; let total = 0;
  for (const t of parts) {
    const cost = (t.includes(" ") ? t.length + 2 : t.length) + 1;
    if (total + cost > 480) { console.log(`  [canh bao] cat bot tag cho vua 500 ky tu`); break; }
    out.push(t); total += cost;
  }
  return out;
}

async function getVideoSnippet(accessToken, videoId) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`videos.list ${r.status}`);
  return (await r.json()).items?.[0]?.snippet || null;
}

async function updateVideoSnippet(accessToken, videoId, snippet) {
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: videoId, snippet }),
  });
  if (!r.ok) throw new Error(`videos.update(snippet) ${r.status}: ${(await r.text()).slice(0, 250)}`);
  return true;
}

// ================== DA KENH ==================
const txt = (v) => (v == null ? "" : (typeof v === "object" ? (v.text ?? v[0]?.text ?? "") : v)).toString().trim();

let _channels = null;
async function loadChannels() {
  if (_channels) return _channels;
  _channels = new Map();
  if (!CFG.tableChannels) return _channels;
  const j = await larkApi("GET",
    `/open-apis/bitable/v1/apps/${CFG.appToken}/tables/${CFG.tableChannels}/records?page_size=200`);
  for (const it of j?.items || []) {
    const f = it.fields || {};
    const code = txt(f["Ma kenh"] ?? f["Mã kênh"]);
    if (!code) continue;
    _channels.set(code, {
      name: txt(f["Ten kenh"] ?? f["Tên kênh"]),
      channelId: txt(f["Channel ID"]),
      tokenLabel: txt(f["Nhan token"] ?? f["Nhãn token"]),
      active: txt(f["Trang thai"] ?? f["Trạng thái"]) !== "Tạm dừng",
    });
  }
  console.log(`So kenh khai bao trong bang Kenh: ${_channels.size}`);
  return _channels;
}

async function getMyChannel(accessToken) {
  const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await r.json();
  const c = j.items?.[0];
  if (!c) throw new Error(`Khong doc duoc kenh cua token: ${JSON.stringify(j).slice(0, 200)}`);
  return { id: c.id, title: c.snippet?.title, handle: c.snippet?.customUrl };
}

const _tokCache = new Map();
// Lay access token DUNG KENH + CHOT AN TOAN: tu choi neu token khong thuoc kenh khai bao.
async function tokenForChannel(code) {
  const key = code || "__default__";
  if (_tokCache.has(key)) return _tokCache.get(key);
  let refresh = CFG.oauthRefreshToken, expectId = "", label = "(mac dinh)";
  // CHOT AN TOAN: da cau hinh da kenh ma dong khong chon "Kenh" -> TU CHOI, tranh dang nham kenh mac dinh.
  if (!code && CFG.tableChannels) {
    throw new Error('Chua chon cot "Kenh" cho dong nay -> TU CHOI dang de tranh dang nham kenh. Hay chon Kenh roi dat lai Trang thai = "Cho dang".');
  }
  if (code) {
    const ch = (await loadChannels()).get(code);
    if (!ch) throw new Error(`Kenh "${code}" chua khai bao trong bang Kenh (TABLE_CHANNELS)`);
    if (!ch.active) throw new Error(`Kenh "${code}" dang o trang thai Tam dung`);
    if (!ch.tokenLabel) throw new Error(`Kenh "${code}" thieu "Nhan token" trong bang Kenh`);
    const secrets = JSON.parse(E.ALL_SECRETS || "{}");
    refresh = secrets[ch.tokenLabel];
    label = ch.tokenLabel; expectId = ch.channelId;
    if (!refresh) throw new Error(`Thieu GitHub Secret "${ch.tokenLabel}" cho kenh ${code}`);
  }
  const at = await ytAccessToken(refresh);
  const mine = await getMyChannel(at);
  if (expectId && mine.id !== expectId)
    throw new Error(`SAI KENH! Token "${label}" thuoc "${mine.title}" (${mine.id}) nhung bang khai bao ${code}=${expectId}. Da CHAN dang.`);
  console.log(`  [kenh] ${code || "(mac dinh)"} -> "${mine.title}" ${mine.handle || ""} [OK]`);
  _tokCache.set(key, at);
  return at;
}
// ============================================

async function setSyntheticFlag(accessToken, videoId, value) {
  const g = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!g.ok) throw new Error(`videos.list ${g.status}: ${(await g.text()).slice(0, 200)}`);
  const cur = (await g.json()).items?.[0]?.status;
  if (!cur) throw new Error("khong tim thay video");
  const status = {
    privacyStatus: cur.privacyStatus,
    selfDeclaredMadeForKids: cur.selfDeclaredMadeForKids ?? false,
    containsSyntheticMedia: value,
  };
  if (cur.publishAt) status.publishAt = cur.publishAt;
  if (cur.license) status.license = cur.license;
  if (typeof cur.embeddable === "boolean") status.embeddable = cur.embeddable;
  const r = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: videoId, status }),
  });
  if (!r.ok) throw new Error(`videos.update ${r.status}: ${(await r.text()).slice(0, 250)}`);
  return true;
}

async function setThumbnail(accessToken, videoId, filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  if (buf.length > 2 * 1024 * 1024)
    throw new Error(`ảnh ${(buf.length / 1e6).toFixed(2)}MB vượt giới hạn 2MB của YouTube`);
  const r = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": mime }, body: buf }
  );
  if (!r.ok) throw new Error(`thumbnails.set ${r.status}: ${(await r.text()).slice(0, 250)}`);
  return true;
}

async function main() {
  // Bảng: KHÔNG bắt người triển khai đi copy table_id. Bỏ trống thì tự tìm theo TÊN ("16.3").
  // Vẫn cho ghi đè bằng TABLE_POST nếu ai đó cố tình đặt tên bảng khác.
  const { resolveTable } = await import(new URL("../../../../scripts/lib/resolve-table.mjs", import.meta.url));
  CFG.tablePost = await resolveTable({
    domain: CFG.larkDomain, appId: CFG.larkAppId, appSecret: CFG.larkAppSecret,
    base: CFG.appToken, hint: CFG.tablePost || "16.3", label: "bảng đăng video",
  });
  console.log(`Bảng đăng video: ${CFG.tablePost}`);

  const need = DRY ? [] : ["oauthClientId", "oauthClientSecret", "oauthRefreshToken"];
  for (const k of need) {
    if (!CFG[k]) throw new Error(`Thiếu "${k}" — đặt ở GitHub Secrets (YT_OAUTH_CLIENT_SECRET / YT_OAUTH_REFRESH_TOKEN) hoặc chạy get-oauth-token.mjs.`);
  }
  const rows = await listPending();
  let pending;
  if (RECORD_ID) {
    // Nút bấm Lark: chỉ đăng đúng 1 dòng (bỏ qua điều kiện Trạng thái, chỉ cần có Video).
    pending = rows.filter((r) => r.record_id === RECORD_ID && Array.isArray(r.fields["Video"]) && r.fields["Video"].length > 0);
    console.log(`record_id=${RECORD_ID}: ${pending.length ? "sẽ đăng" : "không thấy dòng hợp lệ (thiếu Video?)"}.`);
  } else {
    // LEAD_HOURS: nếu đặt (vd 2.5) -> CANH GIỜ, chỉ upload dòng có "Lịch đăng" còn <= LEAD_HOURS.
    // Bỏ trống/0 -> giữ hành vi cũ (upload mọi dòng "Chờ đăng" ngay).
    const LEAD_H = parseFloat(E.LEAD_HOURS || "") || 0;
    const nowMs = Date.now();
    const fmt = (ms) => new Date(ms).toLocaleString("vi-VN");
    pending = rows.filter((r) => {
      const st = r.fields["Trạng thái"];
      const stName = typeof st === "object" ? st?.text : st;
      const vid = r.fields["Video"];
      if (!(stName === "Chờ đăng") || !Array.isArray(vid) || vid.length === 0) return false;
      if (!LEAD_H) return true;
      const ttl = (r.fields["Tiêu đề"]?.text ?? r.fields["Tiêu đề"] ?? "(không tên)").toString().slice(0, 40);
      const sched = r.fields["Lịch đăng"];
      if (!sched) { console.log(`  ⏭  "${ttl}": chưa có "Lịch đăng" -> bỏ qua (chế độ canh giờ).`); return false; }
      const leftH = (sched - nowMs) / 3600000;
      if (leftH <= 0) {
        console.log(`  ⛔ "${ttl}": "Lịch đăng" ${fmt(sched)} ĐÃ QUÁ GIỜ (${leftH.toFixed(1)}h) -> KHÔNG đăng. Hãy dời lịch.`);
        return false;
      }
      if (leftH > LEAD_H) {
        console.log(`  ⏳ "${ttl}": còn ${leftH.toFixed(1)}h tới giờ công khai -> chưa tới lượt (chỉ upload khi <= ${LEAD_H}h).`);
        return false;
      }
      console.log(`  ✅ "${ttl}": còn ${leftH.toFixed(1)}h -> UPLOAD NGAY (sớm hơn giờ công khai ${leftH.toFixed(1)}h).`);
      return true;
    });
    if (LIMIT) pending = pending.slice(0, LIMIT);
    console.log(`Có ${pending.length} video sẽ đăng lần này${LEAD_H ? ` (canh giờ: LEAD_HOURS=${LEAD_H}h)` : ""}${LIMIT ? ` (giới hạn ${LIMIT})` : ""}.`);
  }
  if (!pending.length) return;


  if (THUMB_ONLY) {
    for (const row of pending) {
      const f = row.fields;
      const videoId = (f["Video ID"]?.text ?? f["Video ID"] ?? "").toString().trim();
      const thAtt = Array.isArray(f["Thumbnail"]) && f["Thumbnail"].length ? f["Thumbnail"][0] : null;
      if (!videoId) { console.log("  [bo qua] dong chua co Video ID"); continue; }
      if (!thAtt)   { console.log("  [bo qua] cot Thumbnail trong"); continue; }
      const tmpTh = path.join(os.tmpdir(), `th-${row.record_id}-${thAtt.name}`.replace(/[^\w.\-]/g, "_"));
      try {
        const accessToken = await tokenForChannel(txt(f["Kênh"] ?? f["Kenh"]));
        await downloadAttachment(thAtt, row.record_id, "Thumbnail", tmpTh);
        await setThumbnail(accessToken, videoId, tmpTh);
        console.log(`  [OK] da dat anh bia cho ${videoId}: ${thAtt.name}`);
        if (SYNTHETIC) {
          await setSyntheticFlag(accessToken, videoId, true);
          console.log(`  [OK] da tick "AI use = Yes" cho ${videoId}`);
        }
        const cur = await getVideoSnippet(accessToken, videoId);
        console.log(`  [kiem tra] tag hien co tren YouTube: ${(cur?.tags || []).length}`);
        const wantTags = parseTags(f["Tags"]?.text ?? f["Tags"]);
        if (wantTags.length) {
          await updateVideoSnippet(accessToken, videoId, {
            title: cur?.title || (f["Tiêu đề"]?.text ?? f["Tiêu đề"] ?? "Untitled").toString(),
            description: cur?.description ?? "",
            categoryId: cur?.categoryId || CFG.defaultCategoryId || "22",
            tags: wantTags,
            defaultLanguage: cur?.defaultLanguage,
            defaultAudioLanguage: cur?.defaultAudioLanguage,
          });
          console.log(`  [OK] da ghi ${wantTags.length} tag: ${wantTags.slice(0, 5).join(" | ")}`);
        }
        await updateRow(row.record_id, { "Ghi chú lỗi": "" });
      } catch (e) {
        const note = `Thumbnail chua dat duoc: ${e.message}`.slice(0, 500);
        console.log(`  [LOI] ${note}`);
        try { await updateRow(row.record_id, { "Ghi chú lỗi": note }); } catch {}
      } finally { try { fs.existsSync(tmpTh) && fs.unlinkSync(tmpTh); } catch {} }
    }
    console.log("\nHoan tat (chi dat anh bia).");
    return;
  }

  for (const row of pending) {
    const f = row.fields;
    const title = (f["Tiêu đề"]?.text ?? f["Tiêu đề"] ?? "").toString().trim() || "Untitled";
    const att = f["Video"][0];
    console.log(`\n▶ "${title}" — file ${att.name} (${(att.size / 1e6).toFixed(1)}MB)`);
    if (DRY) { console.log("  [dry-run] bỏ qua upload."); continue; }

    const tmp = path.join(os.tmpdir(), `yt-${row.record_id}-${att.name}`.replace(/[^\w.\-]/g, "_"));
    try {
      await updateRow(row.record_id, { "Trạng thái": "Đang đăng" });
      const accessToken = await tokenForChannel(txt(f["Kênh"] ?? f["Kenh"]));
      const size = await downloadAttachment(att, row.record_id, "Video", tmp);

      const desc = (f["Mô tả"]?.text ?? f["Mô tả"] ?? "").toString();
      const tags = parseTags(f["Tags"]?.text ?? f["Tags"]);
      console.log(`  [tags] ${tags.length} tag: ${tags.slice(0, 5).join(" | ")}${tags.length > 5 ? " ..." : ""}`);
      const privacy = (f["Chế độ"]?.text ?? f["Chế độ"] ?? (CFG.defaultPrivacy || "private")).toString();
      const snippet = { title, description: desc, tags, categoryId: CFG.defaultCategoryId || "22" };
      const status = { privacyStatus: privacy, selfDeclaredMadeForKids: false };
      if (SYNTHETIC) status.containsSyntheticMedia = true;
      const schedMs = f["Lịch đăng"];
      // CHOT AN TOAN TUYET DOI: "Lich dang" da qua gio -> TU CHOI dang.
      // Neu van dang, YouTube se bo qua publishAt va CONG KHAI NGAY LAP TUC -> hong kenh.
      // Ap dung cho MOI kieu chay, ke ca bam tay theo record_id.
      if (schedMs && schedMs <= Date.now()) {
        const t = new Date(schedMs).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
        throw new Error(`TU CHOI DANG: "Lich dang" (${t}) DA QUA GIO. Neu dang se cong khai NGAY LAP TUC thay vi dung lich. Hay doi "Lich dang" sang tuong lai roi dat lai "Cho dang".`);
      }
      if (schedMs) { status.privacyStatus = "private"; status.publishAt = new Date(schedMs).toISOString(); }

      console.log("  ↑ đang upload lên YouTube...");
      const videoId = await uploadToYouTube(accessToken, tmp, size, snippet, status);
      const link = `https://youtu.be/${videoId}`;

      // ---- Đẩy ảnh bìa từ cột "Thumbnail" của Lark ----
      let thumbNote = "";
      const thAtt = Array.isArray(f["Thumbnail"]) && f["Thumbnail"].length ? f["Thumbnail"][0] : null;
      if (!thAtt) {
        console.log('  ⏭  Cột "Thumbnail" trống -> bỏ qua ảnh bìa.');
      } else {
        const tmpTh = path.join(os.tmpdir(), `th-${row.record_id}-${thAtt.name}`.replace(/[^\w.\-]/g, "_"));
        try {
          await downloadAttachment(thAtt, row.record_id, "Thumbnail", tmpTh);
          await setThumbnail(accessToken, videoId, tmpTh);
          console.log(`  🖼  Đã đặt ảnh bìa: ${thAtt.name}`);
        } catch (e) {
          thumbNote = `Thumbnail chưa đặt được: ${e.message}`.slice(0, 500);
          console.log(`  ⚠️  ${thumbNote}`);
        } finally {
          try { fs.existsSync(tmpTh) && fs.unlinkSync(tmpTh); } catch {}
        }
      }

      await updateRow(row.record_id, {
        "Trạng thái": "Đã đăng", "Video ID": videoId,
        "Link video": { link, text: title }, "Ngày đăng": Date.now(), "Ghi chú lỗi": thumbNote,
      });
      console.log(`  ✔ Đã đăng: ${link}`);
    } catch (e) {
      console.log(`  ✗ Lỗi: ${e.message}`);
      // Het quota YouTube -> KHONG danh dau "Loi" (se ket vinh vien), ma giu "Cho dang"
      // de lan chay hom sau tu dang tiep. Va dung luon vong lap vi quota da het.
      const isQuota = /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(e.message);
      try {
        await updateRow(row.record_id, {
          "Trạng thái": isQuota ? "Chờ đăng" : "Lỗi",
          "Ghi chú lỗi": (isQuota ? "[HET QUOTA - se tu dang lai hom sau] " : "") + e.message.slice(0, 850),
        });
      } catch {}
      if (isQuota) {
        console.log("  [QUOTA] Het quota YouTube hom nay -> giu 'Cho dang', dung lai. Hom sau tu chay tiep.");
        break;
      }
    } finally {
      try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch {}
    }
    await sleep(500);
  }
  console.log("\n✔ Hoàn tất.");
}
main().catch((e) => { console.error("LỖI:", e.message); process.exit(1); });
