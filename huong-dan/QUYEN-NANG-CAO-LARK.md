# Base bật "Quyền nâng cao" — phải gán bot vào Vai trò

Khi một Lark Base bật **Quyền nâng cao (Advanced Permissions)**, quyền không còn tính theo
"Xem / Chỉnh sửa cả Base" nữa mà chia theo **Vai trò (Role)**. Ai — kể cả **app/bot** chạy
automation — **không nằm trong một Vai trò** thì coi như không có quyền, **dù trước đó đã được
thêm làm cộng tác viên "Chỉnh sửa"**.

> Vì sao một Base lại bật cái này? Thường gặp ở base dùng chung nhiều người: muốn **mỗi thợ chỉ
> thấy dòng của mình**, hoặc **ẩn cột lương / giá vốn** với một số người. Bật xong là ràng buộc
> luôn cả bot đang chạy sync/đăng.

---

## Dấu hiệu bot bị chặn (không phải chỉ "thiếu file")

| Hiện tượng | Thực chất |
|---|---|
| `sync-youtube` chạy **xanh** nhưng bảng **không thêm / không cập nhật dòng nào** | bot không **thấy** bản ghi |
| Đăng video báo **không tìm thấy record** dù record có thật | bot không đọc được dòng |
| Ghi được chữ nhưng **Video / Thumbnail thiếu file** | bot không tải/upload được cột attachment |
| Log Lark: `1061045`, `91403`, `1254…`, `no permission` | lớp quyền bảng/bản ghi/cột chặn |

Script **đã tự lo phần kỹ thuật**: mọi lệnh tải/ghi file đều tự gắn `extra=bitablePerm` để đi
qua lớp quyền nâng cao (thử URL trần → `extra` dạng attachments → `extra` dạng `rev` → URL Lark
trả sẵn). Nhưng phần mềm **không tự cấp quyền cho chính nó** — việc còn lại là **bạn gán bot vào
một Vai trò đủ quyền**.

---

## Cách sửa — gán app/bot vào một Vai trò

1. Mở Base → **Chia sẻ / ⋯ (More)** → **Quản lý quyền nâng cao / Advanced permissions**.
2. Tạo (hoặc chọn) một **Vai trò** cho automation, cấu hình đủ 3 lớp:
   - **Bảng:** bật cả **16.1 · 16.2 · 16.3**.
   - **Bản ghi:** **Tất cả bản ghi**, bật cả **Xem** và **Sửa**.
     (Đừng để "chỉ bản ghi do mình tạo" — bot sẽ không thấy dòng người khác nhập vào.)
   - **Cột / Trường:** để **Xem + Sửa** cho mọi cột đang dùng — **nhất là cột `Video` và
     `Thumbnail`** (attachment). Cột nào đặt "Ẩn" thì bot cũng không đọc/ghi được cột đó.
3. **Gán người:** thêm chính **app/bot** (tài khoản `cli_...` của bạn) vào Vai trò đó → **Lưu**.
4. Chạy lại `sync-youtube` / `dang-video-youtube` — giờ đã đủ quyền.

> ⚠️ Chỉ thêm bot làm cộng tác viên "Chỉnh sửa" qua nút **Chia sẻ** là **CHƯA đủ** một khi quyền
> nâng cao đã bật. Bắt buộc phải nằm trong một **Vai trò**.

---

## Lỗi khi Lưu Vai trò: *"Bạn không có quyền mời cộng tác viên này"*

Gán ai vào Vai trò thì người/bot đó **phải đã là cộng tác viên** của Base; nếu chưa, Lark tự mời
khi bạn Lưu — và lần mời đó **thất bại** vì tài khoản bạn đang thao tác không đủ thẩm quyền mời.
Nguyên nhân hay gặp nhất: **Base là "Bên ngoài" (external)** — bạn không thuộc tổ chức sở hữu Base.

Xử lý, theo thứ tự:
1. **Thêm bot làm cộng tác viên (mức Chỉnh sửa) qua nút Chia sẻ TRƯỚC**, rồi mới gán vào Vai trò.
2. Nhờ **chủ sở hữu thật** của Base (đúng tổ chức, quyền Quản lý/Toàn quyền) gán hộ, hoặc cấp cho
   bạn quyền **Quản lý**.
3. Xoá bớt từng người khỏi Vai trò rồi Lưu để khoanh đúng người đang bị chặn.
4. Nhờ **Admin** bật cho phép mời/chia sẻ người ngoài trong Admin Console.

---

Chi tiết kỹ thuật trong code: xem mục *gotcha* của
[SKILL đăng video](../.claude/skills/hmh-AIOS-dang-video-youtube/SKILL.md) và
[SKILL sync](../.claude/skills/hmh-AIOS-sync-youtube-lark/SKILL.md).
