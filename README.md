# Lịch công việc

Ứng dụng web nội bộ: Node.js 22 · Express 5 · Handlebars · Tailwind CSS 4 · SQLite.

## Chạy trên máy
**Windows, không cần gõ lệnh:** cài Node.js (bản LTS ở nodejs.org), rồi bấm đúp `chay-app.bat`.
App chạy ở chế độ tự nạp lại: sửa code xong không cần đóng/mở lại cửa sổ.

```bash
npm install
cp .env.example .env      # rồi sửa SESSION_SECRET
npm run dev               # http://localhost:3000 (tự reload khi sửa code)
```

## Lệnh thường dùng
| Lệnh | Việc |
|------|------|
| `npm run dev` | Chạy chế độ phát triển |
| `npm test` | Chạy test |
| `npm run check` | Tự review: cú pháp, test, bảo mật, cấu trúc |
| `npm run share` | Tạo link public tạm thời từ máy này (Cloudflare Tunnel) |
| `npm run migrate` | Chạy migration database |

## Cấu trúc
```
src/
  app.js              lắp ráp Express (middleware, view, module)
  server.js           khởi động: migrate + listen
  config/             đọc biến môi trường (duy nhất ở đây)
  db/                 kết nối SQLite, migrate, migrations/*.sql
  lib/                tiện ích dùng chung (validate, pagination, errors, view-helpers)
  middleware/         csrf, flash, locals, xử lý lỗi
  modules/<tên>/      mỗi tính năng: routes → controller → service → repo (+ schema)
  views/              layouts, partials (UI dùng chung), <tên module>/
  styles/app.css      Tailwind + bộ class UI dùng chung (.btn-primary, .card, .input…)
public/               file tĩnh (css build ra, js, ảnh)
tests/                test (node:test + supertest)
docs/PROJECT.md       sổ tay dự án
```

## Deploy lên Coolify (Docker)
Dùng `Dockerfile` + `docker-compose.yml`. Compose dùng `expose` chứ không dùng `ports`, nên app không
chiếm cổng nào trên server và không đụng các project khác; Coolify trỏ tên miền vào cổng 3000 bên trong.

1. Coolify → **New Resource** → chọn repo GitHub → Build Pack **Docker Compose**.
2. Tab **Environment Variables**: điền `ADMIN_EMAIL`, `ADMIN_PASSWORD` (bắt buộc, tạo tài khoản quản lý lần đầu).
   `SESSION_SECRET` Coolify tự sinh. Tuỳ chọn: `APP_NAME`, `ALLOW_SIGNUP`, `DATABASE_URL` + `DATABASE_AUTH_TOKEN` (Turso).
3. Ở service `app`, đặt **Domain** (VD `https://lich.ten-mien.com`) rồi **Deploy**.

Dữ liệu SQLite nằm trong volume `app-data` (`/app/data`), không mất khi deploy lại.
Nên dùng tên miền **https**: ở production cookie đăng nhập chỉ gửi qua https.

## Deploy free
Xem hướng dẫn trong `render.yaml` (Render free + Turso free) hoặc `npm run share`.
