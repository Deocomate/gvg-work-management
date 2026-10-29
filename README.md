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

## Deploy free
Xem hướng dẫn trong `render.yaml` (Render free + Turso free) hoặc `npm run share`.
