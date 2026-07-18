# Triển khai module YouTube — mục tiêu dưới 20 phút

| Bước | Việc | Thời gian |
|---|---|---|
| 1 | Chuẩn bị giá trị (Lark + YouTube API key) | 8 phút |
| 2 | Fork repo này | 1 phút |
| 3 | Bật Actions trên bản fork | 30 giây |
| 4 | Dán Secrets + Variables | 3 phút |
| 5 | Chạy `init-tables` → `sync-youtube` | 2 phút |
| 6 | Tạo automation trong Lark Base | 5 phút |

> **Chỉ muốn LẤY DỮ LIỆU về (16.1/16.2), chưa cần đăng video?** Bỏ qua toàn bộ phần OAuth ở bước 1D. Xong trong ~10 phút.

> **Làm hàng loạt cho nhiều học viên?** Bỏ qua bước 2–5, xem [trien-khai/README.md](trien-khai/README.md) — một lệnh, ~3 phút/người.

---

## Bước 1 — Chuẩn bị

### A. Lark App (`LARK_APP_ID`, `LARK_APP_SECRET`)

1. <https://open.larksuite.com/app> → **Create custom app** → tab **Credentials** copy **App ID** + **App Secret**.
2. Tab **Permissions & Scopes** → thêm: `bitable:app`, `drive:drive`, `base:record:retrieve`, `base:table:create` → **Create version → Submit for release**.
3. **Quan trọng:** mở Lark Base → **⋯ → thêm app vừa tạo làm cộng tác viên quyền Chỉnh sửa**. Thiếu bước này thì app đọc được nhưng **không ghi được**.

   > Nếu Base **đã bật Quyền nâng cao** thì thêm cộng tác viên thôi **chưa đủ** — phải gán app vào một **Vai trò**. Xem [huong-dan/QUYEN-NANG-CAO-LARK.md](huong-dan/QUYEN-NANG-CAO-LARK.md).

### B. Lark Base ID (`LARK_BASE_ID`)

```
https://xxx.sg.larksuite.com/base/ZM8qbz78JaR16Es560sly6Bkgvg
                                  └────── đây là LARK_BASE_ID ──────┘
```

### C. YouTube API key (`YOUTUBE_API_KEY`) — để LẤY dữ liệu

1. <https://console.cloud.google.com/> → tạo project.
2. **APIs & Services → Library** → bật **YouTube Data API v3**.
3. **Credentials → Create credentials → API key** → copy.

Và `YT_CHANNEL`: handle kênh (`@tenkenh`) hoặc channel ID (`UCxxxxxxxx`).

> ⚠️ Handle phải **chính xác tuyệt đối**. Gõ thiếu một chữ là YouTube trả về một kênh khác trùng tên, và bạn sẽ đồng bộ nhầm kênh mà không hay biết. Mở kênh trên trình duyệt, copy y nguyên phần `@...` trên thanh địa chỉ.

### D. OAuth (`YT_OAUTH_*`) — chỉ cần nếu muốn ĐĂNG video

API key **không đăng video được** — đăng video bắt buộc OAuth (thay mặt chủ kênh).

1. Google Cloud → **Credentials → Create credentials → OAuth client ID → Desktop app** → copy **Client ID** + **Client secret**.
2. Lấy **refresh token** (chạy 1 lần trên máy có trình duyệt):

```bash
node .claude/skills/hmh-AIOS-dang-video-youtube/scripts/get-oauth-token.mjs
```

Script mở trình duyệt → bạn đăng nhập bằng tài khoản **sở hữu kênh** → cấp quyền → nó in ra refresh token.

> Uỷ quyền đúng kênh cần đăng. Một tài khoản Google quản nhiều kênh thì lúc chọn phải bấm đúng kênh.
>
> **Quota:** mỗi video upload tốn ~1.600 đơn vị, quota mặc định 10.000/ngày → **khoảng 6 video/ngày**. Cần nhiều hơn thì xin tăng quota với Google.

---

## Bước 2 — Fork repo

<https://github.com/hoangminhhoagpt-dot/mentor-club-youtube> → **Fork**.

## Bước 3 — Bật Actions ⚠️

Bản fork → tab **Actions** → bấm nút xanh **"I understand my workflows, go ahead and enable them"**.

> **Bỏ qua bước này là hỏng cả hệ thống mà không có báo lỗi.** Repo fork chưa bật Actions thì lệnh gọi HTTP vẫn trả **204 (như thành công)** nhưng GitHub **không chạy gì cả**.

## Bước 4 — Secrets + Variables

**Settings → Secrets and variables → Actions**

**Tab Secrets:**

| Tên | Giá trị | Bắt buộc |
|---|---|:---:|
| `LARK_APP_SECRET` | App Secret (bước 1A) | ✅ |
| `YOUTUBE_API_KEY` | API key (bước 1C) | ✅ |
| `YT_OAUTH_CLIENT_SECRET` | Client secret (bước 1D) | chỉ khi đăng video |
| `YT_OAUTH_REFRESH_TOKEN` | Refresh token (bước 1D) | chỉ khi đăng video |
| `LARK_NOTIFY_WEBHOOK` | Webhook bot Lark để nhận card báo cáo sau mỗi lần đồng bộ | — |

**Tab Variables:**

| Tên | Giá trị | Bắt buộc | Mặc định nếu bỏ trống |
|---|---|:---:|---|
| `LARK_APP_ID` | `cli_...` | ✅ | — |
| `LARK_BASE_ID` | Base ID | ✅ | — |
| `YT_CHANNEL` | `@handle` hoặc `UCxxxx` | ✅ | — |
| `YT_OAUTH_CLIENT_ID` | Client ID (bước 1D) | chỉ khi đăng video | — |
| `LARK_DOMAIN` | `https://open.larksuite.com` | — | chính giá trị này |
| `YT_PRIVACY` | `private` / `unlisted` / `public` | — | `private` |
| `YT_CATEGORY_ID` | mã danh mục YouTube | — | `22` (People & Blogs) |
| `TABLE_CHANNEL` `TABLE_VIDEO` `TABLE_POST` | chỉ đặt nếu bạn **đổi tên bảng** | — | tự tìm bảng `16.1` / `16.2` / `16.3` |

> Ba biến `TABLE_*` **để trống là tốt nhất** — engine tự tìm bảng theo tên, bạn không phải đi copy `table_id`.

## Bước 5 — Chạy 2 action đầu tiên

Tab **Actions** của bản fork:

1. **`init-tables`** → Run workflow → ~20 giây → 3 bảng `16.1` `16.2` `16.3` hiện ra trong Base, đủ cột.
2. **`sync-youtube`** → Run workflow → bảng 16.1 có kênh, 16.2 có video kèm thumbnail.

Xong 2 bước này là hệ thống **đã sống**.

## Bước 6 — Nối vào Lark Base

Xem **[LARK-AUTOMATION.md](LARK-AUTOMATION.md)** — có sẵn JSON để copy-paste.

---

## Bảng biến — bản tóm tắt

```bash
# ---- GitHub Secrets ----
LARK_APP_SECRET=              # bắt buộc
YOUTUBE_API_KEY=              # bắt buộc (lấy dữ liệu)
YT_OAUTH_CLIENT_SECRET=       # chỉ khi đăng video
YT_OAUTH_REFRESH_TOKEN=       # chỉ khi đăng video
LARK_NOTIFY_WEBHOOK=          # tuỳ chọn — card báo cáo về nhóm Lark

# ---- GitHub Variables ----
LARK_APP_ID=cli_xxxxxxxxxxxx  # bắt buộc
LARK_BASE_ID=xxxxxxxxxxxxxx   # bắt buộc
YT_CHANNEL=@tenkenhcuaban     # bắt buộc
YT_OAUTH_CLIENT_ID=           # chỉ khi đăng video

LARK_DOMAIN=https://open.larksuite.com
YT_PRIVACY=private
YT_CATEGORY_ID=22
TABLE_CHANNEL=   TABLE_VIDEO=   TABLE_POST=     # để trống → tự tìm theo tên bảng

# ---- Không lưu ở GitHub, chỉ dán vào Lark automation ----
GITHUB_PAT=ghp_xxxxxxxx       # PAT classic, scope "repo"
```

---

## Gặp lỗi thì xem đây

| Hiện tượng | Nguyên nhân | Cách sửa |
|---|---|---|
| Gọi HTTP trả 204 nhưng Actions **không có run nào** | Repo fork **chưa bật Actions** | Làm lại Bước 3 |
| `Không thấy bảng khớp "16.1"` | Chưa chạy `init-tables`, hoặc sai `LARK_BASE_ID` | Chạy `init-tables` |
| Lark trả `91403` / `NOTEXIST` | App Lark **chưa được thêm vào Base** | Bước 1A mục 3 |
| Đồng bộ về **nhầm kênh** (0 sub, 0 video) | `YT_CHANNEL` gõ sai handle | Copy y nguyên `@...` từ thanh địa chỉ của kênh |
| `playlistNotFound` | Cùng nguyên nhân trên — kênh sai/rỗng | Sửa `YT_CHANNEL` |
| `quotaExceeded` | Hết quota YouTube API trong ngày | Chờ hôm sau, hoặc xin tăng quota |
| Đăng video lỗi `insufficientPermissions` | Refresh token thiếu scope `youtube.upload` | Chạy lại `get-oauth-token.mjs` |
| Upload video được ~6 cái rồi dừng | Đụng trần quota (1.600 đơn vị/video) | Xin tăng quota với Google |
| Sync ra **rỗng**, đăng báo **không thấy record**, hoặc video **thiếu file** | Base bật **quyền nâng cao**, bot chưa ở Vai trò nào | Gán app Lark vào một **Vai trò** đủ quyền bảng/bản ghi/cột — xem [huong-dan/QUYEN-NANG-CAO-LARK.md](huong-dan/QUYEN-NANG-CAO-LARK.md) |
