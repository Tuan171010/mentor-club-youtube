# ✅ CHECKLIST CÀI ĐẶT MODULE YOUTUBE (điền & chạy)

> Dành cho người mới: làm từ trên xuống, **copy từng lệnh dán vào PowerShell**, chỗ nào có `<ĐIỀN_...>` thì thay bằng giá trị của bạn. Xong phần nào tick ✅ phần đó.

---

## PHẦN 0 — Chuẩn bị giá trị (điền vào bảng này TRƯỚC)

| # | Giá trị | Của bạn là gì | Lấy ở đâu |
|---|---|---|---|
| 1 | YouTube API key | `AIza...` | Google Cloud Console → APIs → YouTube Data API v3 → Create credentials → API key |
| 2 | Lark App ID | `cli_...` | open.larksuite.com → Developer → app của bạn → Credentials |
| 3 | Lark App Secret | | cùng trang trên |
| 4 | Lark Base ID | `Xxx...` | mở Lark Base, ID nằm trong URL (`base/<ID>`) |
| 5 | Kênh YouTube nguồn | `@handle` | tên kênh YouTube muốn kéo dữ liệu |
| 6 | OAuth Client ID | `xxx.apps.googleusercontent.com` | Google Cloud → Credentials → OAuth client (loại **Desktop**) |
| 7 | OAuth Client Secret | `GOCSPX-...` | cùng OAuth client trên |
| 8 | (tùy chọn) Webhook nhóm Lark | `https://.../hook/...` | Nhóm Lark → Settings → Bots → Custom Bot |

> ⚠️ Điều kiện Lark: app (bot) phải được thêm làm **cộng tác viên "Có thể chỉnh sửa"** của Base, và bật scope `bitable:app` + `drive:drive` rồi **phát hành**.
>
> ⚠️ Nếu Base **đã bật Quyền nâng cao**: thêm cộng tác viên thôi **chưa đủ** — phải gán app vào một **Vai trò** đủ quyền. Xem [`QUYEN-NANG-CAO-LARK.md`](QUYEN-NANG-CAO-LARK.md).

---

## PHẦN 1 — Cài công cụ (chạy 1 lần cho máy mới)

```powershell
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
winget install Git.Git --accept-source-agreements --accept-package-agreements
```
Mở **PowerShell mới** rồi kiểm tra (phải ra số phiên bản):
```powershell
node -v ; git --version
```

## PHẦN 2 — Tải mã nguồn về máy

```powershell
cd $HOME
git clone https://github.com/hoangminhhoagpt-dot/mentor-club-youtube.git
cd mentor-club-youtube
```

## PHẦN 3 — Tạo file cấu hình & điền giá trị

```powershell
# Skill KÉO DỮ LIỆU
Copy-Item ".claude\skills\hmh-AIOS-sync-youtube-lark\scripts\config.example.json" ".claude\skills\hmh-AIOS-sync-youtube-lark\scripts\config.local.json"
# Skill ĐĂNG VIDEO
Copy-Item ".claude\skills\hmh-AIOS-dang-video-youtube\scripts\config.example.json" ".claude\skills\hmh-AIOS-dang-video-youtube\scripts\config.local.json"
# Mở 2 file vừa tạo để điền
notepad ".claude\skills\hmh-AIOS-sync-youtube-lark\scripts\config.local.json"
notepad ".claude\skills\hmh-AIOS-dang-video-youtube\scripts\config.local.json"
```
Điền vào 2 file: `youtubeApiKey`, `larkAppId`, `larkAppSecret`, `appToken` (= Base ID), `channel`, `oauthClientId`, `oauthClientSecret`.
(2 ô `tableChannel/tableVideo/tablePost` để tạm — PHẦN 4 sẽ điền; `oauthRefreshToken` để trống — PHẦN 5 tự điền.)

## PHẦN 4 — Tạo 3 bảng template trong Lark Base

```powershell
node ".claude\skills\hmh-AIOS-sync-youtube-lark\scripts\setup-tables.mjs" --base <ĐIỀN_BASE_ID>
```
Lệnh in ra 3 `table_id`. Mở lại 2 file config, dán:
`table_id 16.1 → tableChannel`, `16.2 → tableVideo`, `16.3 → tablePost`.

## PHẦN 5 — Lấy OAuth refresh token (cho skill đăng video)

```powershell
node ".claude\skills\hmh-AIOS-dang-video-youtube\scripts\get-oauth-token.mjs"
```
Làm theo hướng dẫn trên màn hình (mở link, đăng nhập Google, dán mã). Token tự lưu vào config.

## PHẦN 6 — Chạy thử (nghiệm thu)

```powershell
# Kéo dữ liệu KÊNH (nhẹ, kiểm tra quyền ghi + upload ảnh)
node ".claude\skills\hmh-AIOS-sync-youtube-lark\scripts\sync-youtube-lark.mjs" --only channel
# Thử 20 video
node ".claude\skills\hmh-AIOS-sync-youtube-lark\scripts\sync-youtube-lark.mjs" --only video --limit 20
# Kiểm tra skill đăng (không upload thật)
node ".claude\skills\hmh-AIOS-dang-video-youtube\scripts\post-video-youtube.mjs" --dry-run
```
Thấy `PRE-FLIGHT PASS` và `✔ Hoàn tất` là **xong phần máy local**. ✅

---

## PHẦN 7 (tùy chọn) — Bật chạy trên cloud (GitHub Actions, gọi từ Lark)
Nếu muốn chạy tự động không cần bật máy: xem **`SETUP-GITHUB.md`** (điền Secrets/Variables) và **`HTTP-Lark-templates.md`** (mẫu gọi HTTP từ Lark Base). Cài `gh` 1 lần:
```powershell
winget install GitHub.cli --accept-source-agreements --accept-package-agreements
& "C:\Program Files\GitHub CLI\gh.exe" auth login
```

---

## 🅰️ NẾU MUỐN TÔI (CLAUDE) CÀI HỘ — gửi tôi đúng các giá trị sau:
1. YouTube API key
2. Lark App ID + App Secret
3. Lark Base ID (hoặc bảo tôi tạo Base mới)
4. Kênh YouTube nguồn (`@handle`)
5. OAuth Client ID + Client Secret (loại Desktop)
6. (tùy chọn) Webhook nhóm Lark để nhận báo cáo
7. (chỉ khi cần bật cloud) 1 GitHub PAT scope `repo`

> Có 7 nhóm giá trị trên là tôi dựng chạy được cả local lẫn cloud. Riêng OAuth refresh token: hoặc bạn chạy PHẦN 5 rồi gửi tôi, hoặc ngồi cùng để tôi hướng dẫn lấy.
