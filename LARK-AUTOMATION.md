# Cấu hình Automation trong Lark Base

Mọi automation đều làm **cùng một việc**: gửi 1 request HTTP sang GitHub. Chỉ khác `event_type` trong phần thân.

## Phần khai chung

**Tự động hoá (Automation) → Tạo mới → …chọn cò kích hoạt… → Thêm hành động → Gửi yêu cầu HTTP**

| Ô | Điền |
|---|---|
| **Phương thức** | `POST` |
| **URL** | `https://api.github.com/repos/<OWNER>/<REPO>/dispatches` |
| **Headers** | `Authorization` : `Bearer ghp_xxxxxxxx` (PAT scope `repo`)<br>`Accept` : `application/vnd.github+json`<br>`Content-Type` : `application/json` |
| **Body** | JSON — xem từng automation bên dưới |

Thay `<OWNER>/<REPO>` bằng repo fork của bạn, vd `hoangminhhoagpt-dot/mentor-club-youtube`.

> GitHub trả **204 No Content** (thân rỗng). Lark hiện "phản hồi trống" — **đó là thành công**, không phải lỗi.

---

## 1. Đăng video — bấm là đăng ⭐ (làm cái này trước)

**Cò kích hoạt:** chọn 1 trong 2 cách —

| Cách | Cò kích hoạt | Khi nào dùng |
|---|---|---|
| **A. Nút bấm** (khuyến nghị) | *Khi nhấn nút* → chọn cột nút **`Đăng`** ở bảng 16.3 | Bạn tự tạo cột kiểu **Nút bấm (Button)** trong Lark UI. API không tạo được field này nên `init-tables` không dựng sẵn. |
| **B. Cột chọn** (mặc định) | *Khi bản ghi khớp điều kiện* → bảng **16.3**, điều kiện **`Đăng`** *là* **`Đăng ngay`** | Dùng cột `Đăng` mà `init-tables` đã tạo sẵn. |

**Body:**

```json
{
  "event_type": "dang-video-youtube",
  "client_payload": { "record_id": "<<chèn biến Record ID>>" }
}
```

> Chỗ `<<chèn biến Record ID>>`: **xoá đi rồi bấm nút chèn biến** của Lark (biểu tượng `+` / `@` trong ô Body) → chọn bảng 16.3 → cột **`Record ID`**. Cột này `init-tables` đã tạo sẵn (công thức `RECORD_ID()`). Giữ nguyên **hai dấu nháy kép** bao quanh biến.

**Cách dùng hằng ngày:**
1. Thêm 1 dòng ở bảng 16.3: gõ **Tiêu đề**, kéo file MP4 vào **Video**, điền **Mô tả** / **Tags**, chọn **Chế độ**.
2. Bấm nút **`Đăng`** (hoặc đổi `Đăng` → `Đăng ngay`).
3. Vài phút sau (video càng nặng càng lâu): **Trạng thái = Đã đăng**, có **Video ID** + **Link video**.

**Trạng thái = Lỗi** → đọc **`Ghi chú lỗi`** / **`Log`**.

---

## 2. Đăng theo hàng chờ (quét cả bảng)

**Cò kích hoạt:** *Theo lịch* → mỗi **30 phút**

```json
{"event_type":"dang-video-youtube","client_payload":{}}
```

Không truyền `record_id` → quét cả bảng, đăng mọi dòng **`Trạng thái = Chờ đăng`**.

> Nhớ trần quota: **~6 video/ngày**. Xếp hàng nhiều hơn thì phần dư sẽ lỗi `quotaExceeded` và tự đăng tiếp vào hôm sau (dòng vẫn còn `Chờ đăng`).

---

## 3. Đồng bộ kênh + video (hằng ngày)

**Cò kích hoạt:** *Theo lịch* → mỗi ngày, ví dụ **7:00 sáng**

```json
{"event_type":"sync-youtube","client_payload":{}}
```

Video đã có trong bảng thì **số view/like/comment tự được cập nhật lại**, video mới thì thêm dòng — hành vi mặc định, không cần cờ gì thêm.

Muốn đồng bộ **nhiều kênh** vào cùng một Base: thêm mỗi kênh một hành động HTTP nữa, đổi `channel`:

```json
{"event_type":"sync-youtube","client_payload":{"channel":"@kenh-thu-hai"}}
```

---

## Kiểm tra khi automation "chạy mà không thấy gì"

Theo đúng thứ tự, dừng ở chỗ sai đầu tiên:

1. **Tab Actions trên GitHub có run mới không?**
   - **Không có run nào** → repo fork **chưa bật Actions**. Vào tab Actions bấm nút xanh *"I understand my workflows, go ahead and enable them"*. Đây là lỗi hay gặp nhất: Lark báo gửi thành công (204) nhưng GitHub im lặng không chạy.
   - **Có run, màu đỏ** → bấm vào xem log.
   - **Có run, màu xanh, mà Base không đổi** → sai `LARK_BASE_ID`, hoặc app Lark chưa được thêm vào Base với quyền **Chỉnh sửa**.

2. **Lark báo 401 / 403** → PAT sai hoặc thiếu scope `repo`.

3. **Lark báo 422** → sai `event_type` hoặc thân JSON không hợp lệ.

4. **Đồng bộ ra kênh rỗng (0 sub)** → `YT_CHANNEL` gõ sai handle. Copy y nguyên `@...` từ thanh địa chỉ của kênh.

5. **Sync ra rỗng / đăng báo "không thấy record" / video thiếu file** → Base đang bật **quyền nâng cao** mà bot chưa nằm trong Vai trò nào. Gán app Lark vào một **Vai trò** đủ quyền bảng/bản ghi/cột (chỉ thêm cộng tác viên "Chỉnh sửa" là **chưa đủ**) — xem [huong-dan/QUYEN-NANG-CAO-LARK.md](huong-dan/QUYEN-NANG-CAO-LARK.md).
