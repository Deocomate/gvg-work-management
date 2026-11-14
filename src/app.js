// Lắp ráp ứng dụng Express. Không gọi listen() ở đây để test có thể dùng app trực tiếp.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import { engine } from 'express-handlebars';

import { config } from '#config';
import { helpers } from '#lib/view-helpers.js';
import { PREVIEW_HOSTS } from '#lib/link-preview.js';
import { csrf } from '#middleware/csrf.js';
import { upload } from '#middleware/upload.js';
import { flash } from '#middleware/flash.js';
import { locals } from '#middleware/locals.js';
import { errorHandler, notFoundHandler } from '#middleware/errors.js';
import { registerModules } from '#modules/index.js';
import { loadUser } from '#middleware/auth.js';
import { findUserById } from '#modules/auth/auth.service.js';
import { taskBadge } from '#middleware/task-badge.js';
import { PAYROLL_PATH, payrollConfigProblem, payrollRouter } from '#modules/payroll/payroll.mount.js';
// [vibe:app-imports]

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = path.join(ROOT, 'src', 'views');

export function createApp() {
  const app = express();

  // Chạy sau proxy HTTPS (Render, Cloudflare Tunnel, Nginx) -> tin header X-Forwarded-*.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: path.join(VIEWS, 'layouts'),
      partialsDir: path.join(VIEWS, 'partials'),
      helpers,
      // Không thụt lề nội dung partial theo chỗ gọi: nếu thụt, chữ nhiều dòng trong <textarea>
      // (ghi chú, link) bị chèn thêm dấu cách mỗi lần mở form sửa.
      compilerOptions: { preventIndent: true },
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', VIEWS);

  // Chấm công & tính lương: app riêng (đăng nhập, mã hoá, header bảo mật riêng) nên gắn trước helmet/session/csrf.
  const session = cookieSession({
    name: 'sid',
    keys: [config.sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: config.isProd,
  });
  // Đăng nhập chung: vào Lương bằng phiên đăng nhập lịch công việc. Có liên kết tài khoản lương (trang Nhân viên)
  // thì theo liên kết; Quản lý chưa liên kết = chủ cửa hàng (toàn quyền lương).
  const ssoUser = async (req, res) => {
    await new Promise((resolve, reject) => session(req, res, (err) => (err ? reject(err) : resolve())));
    const user = req.session?.userId ? await findUserById(req.session.userId) : null;
    const who = user?.payroll_who || (user?.role === 'admin' ? 'admin' : null);
    return who ? { who, name: user.name } : null;
  };
  app.use(PAYROLL_PATH, payrollRouter(config.payroll, { ssoUser }));
  app.locals.payrollEnabled = !payrollConfigProblem(); // hiện chấm công trên lịch tuần/tháng

  app.use(
    helmet({
      contentSecurityPolicy: {
        // frame-src: chỉ cho nhúng khung "Xem trước" của Google Drive/Docs, YouTube (trang Tài liệu).
        directives: { 'upgrade-insecure-requests': null, 'frame-src': ["'self'", ...PREVIEW_HOSTS] },
      },
    }),
  );
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: config.isProd ? '7d' : 0 }));
  // Thư viện chụp ảnh khung HTML (tải PNG/PDF thẻ khách hàng). Phục vụ từ node_modules vì CSP chỉ cho script cùng nguồn.
  app.get('/vendor/html-to-image.js', (req, res) =>
    res.sendFile(path.join(ROOT, 'node_modules', 'html-to-image', 'dist', 'html-to-image.js'), { maxAge: config.isProd ? '7d' : 0 }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(session);

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.use(locals);
  app.use(flash);
  app.use(upload); // form có file: đọc multipart trước để csrf thấy _csrf
  app.use(csrf);
  app.use(loadUser);
  app.use(taskBadge);
  // [vibe:app-middleware]

  registerModules(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
