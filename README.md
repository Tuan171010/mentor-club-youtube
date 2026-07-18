# Module YouTube ⇄ Lark Base

Bộ tự động hoá nối **YouTube** với **Lark Base**, chạy trên **GitHub Actions** — không cần server, không cần bật máy tính.

Mỗi việc là một **action gọi bằng HTTP**, nên Lark Base bấm nút là chạy.

| Action | Việc | Bảng |
|---|---|---|
| `init-tables` | Tạo sẵn 3 bảng mẫu vào Base của bạn | tất cả |
| `sync-youtube` | Lấy dữ liệu kênh + video (view, like, comment, thumbnail) | 16.1 · 16.2 |
| `dang-video-youtube` | Đăng video từ Lark lên YouTube (OAuth, resumable) | 16.3 |

---

## Khởi tạo nhanh nhất — 1 lệnh

Điền các giá trị vào đầu file rồi chạy. Script làm hết: tạo 3 bảng → lấy kênh + video → kiểm tra bảng đăng.

```bash
git clone https://github.com/hoangminhhoagpt-dot/mentor-club-youtube
cd mentor-club-youtube
```

```powershell
# Windows — mở khoi-tao.ps1, điền giá trị, rồi:
.\khoi-tao.ps1
```

```bash
# macOS / Linux — mở khoi-tao.sh, điền giá trị, rồi:
bash khoi-tao.sh
```

Bắt buộc: `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_BASE_ID`, `YOUTUBE_API_KEY`, `YT_CHANNEL`.
Ba biến `YT_OAUTH_*` **chỉ cần nếu muốn ĐĂNG video** — bỏ trống vẫn lấy dữ liệu được.

Chạy lại bao nhiêu lần cũng được — **không tạo bảng trùng, không tạo dòng trùng**.

---

## Bắt đầu

| Bạn muốn | Đọc file |
|---|---|
| Triển khai cho mình / cho khách (dưới 20 phút) | **[TRIEN-KHAI.md](TRIEN-KHAI.md)** |
| Xem chi tiết từng action + tham số | [ACTIONS.md](ACTIONS.md) |
| Cấu hình nút bấm & tự động hoá trong Lark Base | [LARK-AUTOMATION.md](LARK-AUTOMATION.md) |
| Base bật "Quyền nâng cao" mà bot bị chặn (sync rỗng / thiếu file) | [huong-dan/QUYEN-NANG-CAO-LARK.md](huong-dan/QUYEN-NANG-CAO-LARK.md) |
| Làm hàng loạt cho nhiều học viên (1 lệnh/người) | [trien-khai/README.md](trien-khai/README.md) |

Tài liệu cũ chi tiết hơn nằm ở [huong-dan/](huong-dan/).

## Nguyên tắc thiết kế

- **Không copy table_id.** Engine tự tìm bảng theo tên (`16.1`, `16.2`, `16.3`). Bạn chỉ cần khai `LARK_BASE_ID`.
- **Chạy lại bao nhiêu lần cũng được.** Kênh khớp theo link, video khớp theo `video id` → chạy lại là cập nhật số liệu, không tạo bản trùng.
- **`init-tables` là vá, không phá.** Bảng đã có thì chỉ thêm cột còn thiếu; cột đã có thì giữ nguyên, không đổi kiểu.
- **Bí mật nằm trong GitHub Secrets**, không nằm trong code. Token hết hạn chỉ cần đổi Secret.

> 🔒 Không bao giờ commit `config.local.json` / `khach.config.json` (đã chặn trong `.gitignore`).
