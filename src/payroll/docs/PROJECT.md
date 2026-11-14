# Gốm Vũ Gia · Chấm công & Lương

> Sổ tay dự án. Đọc file này đầu mỗi phiên làm việc và cập nhật cuối mỗi nhiệm vụ.

## Mục đích
- Ai dùng: chủ cửa hàng và 3 nhân viên (Nhài, Long, Trang).
- Giải quyết việc gì: nhân viên tự chấm công và xem lương, chủ xem báo cáo, chốt lương, xuất thẻ lương kèm QR chuyển khoản.

## Link
- Production: chưa deploy. Sẽ chạy trên Coolify bằng `docker-compose.yml`, các bước ở `docs/SERVER.md`.
- Bản đang dùng thật: Claude artifact https://claude.ai/artifact/FwoJLNNEdUCaTKy6u9ohZx
- Repo: https://github.com/Deocomate/thceramics-payroll (công khai). File này, `docs/CALCULATIONS.md`, `docs/reference/`, `docs/screenshots/` và `dist/` chỉ nằm trên máy.
- Nhánh `payroll-updates-2026-11` chỉ giữ trên máy, có tên và số liệu thật trong lịch sử. Không được push nhánh này.

## Cấu trúc
- Giao diện: `src/app.html`, `src/qr.js`, `src/assets/`. `npm run build` ghép lại thành `dist/index.html`.
- Máy chủ: `server/` (Express + SQLite). Máy chủ phục vụ `dist/index.html` và thay thế `window.claude` bằng `server/runtime.js`.
- Cùng một `dist/index.html` chạy được cả trên Claude lẫn trên server riêng.

## Lệnh
- `npm start`: chạy app ở http://localhost:3000 (cần `.env`).
- `npm run build`: dựng lại `dist/index.html` sau khi sửa `src/`.
- `npm run check`: kiểm tra cú pháp, secret và toàn bộ test. Phải đạt trước khi bàn giao.
- `npm run import -- <file.json>`: nạp file sao lưu vào server.

## Tính năng
- [x] Chấm công, lương theo công và theo giờ, hoa hồng, thưởng và khấu trừ, chốt lương, thẻ lương QR
- [x] Mọi ngày chấm Đi làm tính 1 công, Nửa buổi 0,5 công, kể cả Thứ 7 và Chủ nhật (áp dụng cả tháng 10/2026)
- [x] Lương giờ: tự điền các ca làm, giờ nghỉ giữa các ca không tính lương
- [x] Server riêng: mật khẩu cửa hàng, phân quyền trên máy chủ, sao lưu và nhập dữ liệu
- [ ] Cài lên server thật
- [ ] Chuyển dữ liệu thật từ Claude sang

## Dữ liệu (bảng chính)
| Bảng | Mô tả |
|------|-------|
| docs | Mỗi dòng một tài liệu JSON, cùng đường dẫn như `db/SCHEMA.md`. Lương và chấm công đã mã hóa trên trình duyệt |
| auth | Hash token đăng nhập của chủ và từng nhân viên |

## Quyết định quan trọng
- Giữ giao diện một file `src/app.html` thay vì viết lại bằng Handlebars và Tailwind: app đã chạy thật, có test, và phải tiếp tục chạy trên Claude trong lúc chuyển.
- Máy chủ không nhận mật khẩu riêng để dữ liệu vẫn được mã hóa đầu cuối. Đăng nhập bằng token tính từ khóa dữ liệu, xem `db/SCHEMA.md`.
- Có mật khẩu cửa hàng dùng chung vì màn đăng nhập phải đọc khóa đã bọc trước khi biết là ai, nếu không người lạ tải được về để dò mật khẩu.
- Bắt buộc HTTPS vì Web Crypto không chạy trên HTTP, trừ localhost.
- Deploy bằng Docker trên Coolify, proxy của Coolify lo HTTPS, không dùng Nginx. Compose chỉ `expose` cổng 3000 để không trùng cổng với app khác trên máy chủ.

## Nhật ký thay đổi
- 2026-11-13 — Nhân viên lương giờ tự điền các ca làm (bắt đầu – kết thúc, thêm được nhiều ca), bỏ nút bấm ca chính và nút điền ca chuẩn. Đổi tên ô trực page ngày nghỉ thành "Trực page (Nghỉ)".
- 2026-11-02 — Đưa lên GitHub công khai: tách dữ liệu riêng, code dùng tên và số mẫu, lịch sử Git mới.
- 2026-11-02 — Thêm Dockerfile và docker-compose cho Coolify, bỏ PM2 và Caddy.
- 2026-11-02 — Hoàn thiện chạy thật: `.env` trên máy, `/healthz`, `npm run check`, sổ tay dự án.
- 2026-11-02 — Thêm server riêng, nút sao lưu, lệnh nhập dữ liệu.
- 2026-11-02 — Đổi quy tắc công Thứ 7 và Chủ nhật theo file chủ gửi.
