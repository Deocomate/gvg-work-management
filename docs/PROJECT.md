# Lịch công việc

> Sổ tay dự án. Claude đọc file này ĐẦU mỗi phiên làm việc và cập nhật CUỐI mỗi nhiệm vụ,
> để lần sau (hoặc người khác) tiếp tục được ngay mà không phải hỏi lại.

## Mục đích
- Ai dùng: quản lý và nhân viên trong công ty.
- Giải quyết việc gì: quản lý giao việc theo ngày/giờ; nhân viên mở app là thấy ngay hôm nay phải làm gì (dòng thời gian), xem lịch tháng, bấm Bắt đầu/Xong để báo tiến độ.

## Link
- Link chia sẻ / production: (chưa deploy)
- Repo: (chưa có)

## Tính năng
<!-- Cập nhật trạng thái: [x] xong · [ ] dự kiến -->
- [x] Khung ứng dụng (trang chủ, xử lý lỗi, bảo mật cơ bản)
- [x] Đăng nhập (admin tạo từ ADMIN_EMAIL/ADMIN_PASSWORD; tự đăng ký khi ALLOW_SIGNUP=true)
- [x] Hôm nay (`/today`): dòng thời gian việc trong ngày, tiến độ, nhắc việc tồn từ ngày trước, đánh dấu đang diễn ra/trễ, nút Bắt đầu/Xong/Mở lại
- [x] Lịch tháng (`/calendar`): việc theo từng ngày, chấm đỏ ngày đã qua còn việc chưa xong; bấm ngày để xem chi tiết
- [x] Giao việc (`/tasks`): tên, ghi chú, người làm, ngày, giờ bắt đầu/kết thúc (trống = cả ngày), mức độ; lặp lại hằng ngày / Thứ 2–6 / hằng tuần (tối đa 92 ngày)
- [x] Quyền: quản lý giao việc cho mọi người, xem theo từng nhân viên hoặc tất cả; nhân viên chỉ thấy việc của mình, tự thêm việc cá nhân, sửa/xoá việc mình tạo
- [x] Nhân viên (`/staff`, chỉ quản lý): thêm/sửa/xoá tài khoản, đặt lại mật khẩu, phân vai trò
- [x] Menu "Hôm nay" có số đỏ = số việc chưa xong hôm nay
- [ ] Nhắc việc qua email/Zalo/Telegram (cần dịch vụ ngoài)
- [ ] Bình luận / đính kèm file cho từng việc
<!-- [vibe:features] -->

## Dữ liệu (bảng chính)
| Bảng | Mô tả |
|------|-------|
| _migrations | (hệ thống) các migration đã chạy |
| users | tài khoản: email, tên, vai trò admin/member |
| tasks | công việc: tiêu đề, ghi chú, người làm (assignee_id), người tạo, ngày, giờ bắt đầu/kết thúc, mức độ, trạng thái todo/doing/done, thời điểm xong |
<!-- [vibe:tables] -->

## Quyết định quan trọng
- Stack: Node.js 22 + Express 5 + Handlebars + Tailwind CSS 4 + SQLite (libsql).
- Không cho tự đăng ký (ALLOW_SIGNUP=false): quản lý tạo tài khoản ở trang Nhân viên. Vai trò: admin = Quản lý, member = Nhân viên.
- Việc lặp lại được tạo thành từng việc riêng cho mỗi ngày (sửa/xoá từng ngày độc lập, đơn giản, không cần chạy nền).
- "Thông báo" hiện là trong app (số đỏ trên menu + khung nhắc việc tồn). Email/Zalo cần dịch vụ gửi tin — chưa làm.
- Giờ "hôm nay", "đang diễn ra", "trễ" tính theo giờ Việt Nam (APP_TIMEZONE), không theo giờ máy chủ.

## Nhật ký thay đổi
<!-- Mới nhất ở trên. Mỗi dòng: ngày — thay đổi — ai yêu cầu (nếu biết) -->
- 2026-10-28 — Xây bản đầu: Hôm nay, Lịch tháng, Giao việc (có lặp lại), Nhân viên, phân quyền quản lý/nhân viên.
- 2026-10-28 — Khởi tạo dự án.
