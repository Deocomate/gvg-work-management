# Lịch công việc

> Sổ tay dự án. Claude đọc file này ĐẦU mỗi phiên làm việc và cập nhật CUỐI mỗi nhiệm vụ,
> để lần sau (hoặc người khác) tiếp tục được ngay mà không phải hỏi lại.

## Mục đích
- Ai dùng: …
- Giải quyết việc gì: …

## Link
- Link chia sẻ / production: (chưa deploy)
- Repo: (chưa có)

## Tính năng
<!-- Cập nhật trạng thái: [x] xong · [ ] dự kiến -->
- [x] Khung ứng dụng (trang chủ, xử lý lỗi, bảo mật cơ bản)
- [x] Đăng nhập (admin tạo từ ADMIN_EMAIL/ADMIN_PASSWORD; tự đăng ký khi ALLOW_SIGNUP=true)
<!-- [vibe:features] -->

## Dữ liệu (bảng chính)
| Bảng | Mô tả |
|------|-------|
| _migrations | (hệ thống) các migration đã chạy |
| users | tài khoản: email, tên, vai trò admin/member |
<!-- [vibe:tables] -->

## Quyết định quan trọng
- Stack: Node.js 22 + Express 5 + Handlebars + Tailwind CSS 4 + SQLite (libsql).

## Nhật ký thay đổi
<!-- Mới nhất ở trên. Mỗi dòng: ngày — thay đổi — ai yêu cầu (nếu biết) -->
- 2026-10-28 — Khởi tạo dự án.
