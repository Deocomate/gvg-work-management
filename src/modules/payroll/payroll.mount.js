// Gắn app Chấm công & tính lương (src/payroll, CommonJS) vào đường dẫn /luong/app.
// App này có đăng nhập, mã hoá và header bảo mật riêng nên được gắn TRƯỚC helmet/session/csrf của app chính.
// Dữ liệu nằm ở file SQLite riêng (mặc định data/payroll.db), không đụng DB lịch công việc.
// Đăng nhập chung: người có users.payroll_who (liên kết ở trang Nhân viên) vào Lương bằng chính phiên đăng nhập lịch
// công việc (xem ssoUser trong app.js và /api/me, /api/my-key trong src/payroll/server/app.js).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from '#config';

// Lõi app lương. Trang /luong và Cài đặt > Cài đặt lương nhúng nó bằng iframe (?embed=1&tabs=...).
export const PAYROLL_PATH = '/luong/app';

const require = createRequire(import.meta.url);
const PAYROLL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'payroll');
const payrollServer = () => require(path.join(PAYROLL_DIR, 'server', 'app.js'));

/** Lý do chưa chạy được (chuỗi), hoặc null nếu cấu hình đủ. */
export function payrollConfigProblem({ adminUsername, adminPassword, sessionSecret } = config.payroll) {
  const { USERNAME } = payrollServer();
  if (!sessionSecret) return 'Chưa đặt PAYROLL_SESSION_SECRET.';
  if (!USERNAME.test(adminUsername.trim().toLowerCase())) return 'PAYROLL_ADMIN_USERNAME chỉ gồm chữ không dấu, số, dấu . _ @ -.';
  if (adminPassword && adminPassword.length < 12) return 'PAYROLL_ADMIN_PASSWORD phải có ít nhất 12 ký tự.';
  if (sessionSecret.length < 32) return 'PAYROLL_SESSION_SECRET phải có ít nhất 32 ký tự.';
  return null;
}

// Mỗi file DB mở một lần, dùng chung cho router và trang Nhân viên.
const stores = new Map();
function openPayrollStore(dbFile) {
  if (!stores.has(dbFile)) {
    const { openStore } = require(path.join(PAYROLL_DIR, 'server', 'store.js'));
    const url = dbFile === ':memory:' ? ':memory:' : 'file:' + dbFile;
    if (url !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
    const p = openStore(url);
    p.catch(() => stores.delete(dbFile)); // lần sau thử lại
    stores.set(dbFile, p);
  }
  return stores.get(dbFile);
}

/**
 * Các tài khoản lương để liên kết với tài khoản lịch công việc: [{ value, label }].
 * 'admin' = chủ cửa hàng (toàn quyền), rồi từng nhân viên trong app lương (tên không mã hoá).
 * Phần Lương chưa bật -> [] (ẩn ô liên kết).
 */
export async function payrollAccountOptions(options = config.payroll) {
  if (payrollConfigProblem(options)) return [];
  const store = await openPayrollStore(options.dbFile);
  const cfg = await store.getDoc('cfg/main');
  const staff = (cfg?.staff || []).map((s) => ({ value: s.id, label: `Nhân viên lương: ${s.name}${s.title ? ` · ${s.title}` : ''}` }));
  return [{ value: 'admin', label: 'Chủ cửa hàng (toàn quyền lương)' }, ...staff];
}

/**
 * Router cho /luong/app. Mở DB lần đầu có người vào, các request sau dùng lại.
 * ssoUser(req, res) -> { who, name } | null: tài khoản lương liên kết với người đang đăng nhập lịch công việc.
 */
export function payrollRouter(options = config.payroll, { ssoUser } = {}) {
  const router = express.Router();
  const problem = payrollConfigProblem(options);

  if (problem) {
    router.use((req, res) =>
      res.status(503).type('html').send(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>Tính lương</title><body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto">` +
          `<h1>Tính lương chưa bật</h1><p>${problem}</p><p><a href="/">← Về trang chủ</a></p>`,
      ),
    );
    return router;
  }

  // /luong/app → /luong/app/ để mọi đường dẫn tương đối trong trang đúng chỗ.
  router.get('/', (req, res, next) => (req.originalUrl.split('?')[0] === PAYROLL_PATH ? res.redirect(301, PAYROLL_PATH + '/') : next()));

  let ready;
  const load = () =>
    (ready ??= (async () => {
      const { createApp } = payrollServer();
      return createApp({
        store: await openPayrollStore(options.dbFile),
        secret: options.sessionSecret,
        adminUsername: options.adminUsername,
        // Không đặt mật khẩu: tắt đăng nhập riêng bằng "admin" (mật khẩu ngẫu nhiên không ai biết); chủ vào bằng tài khoản lịch.
        adminPassword: options.adminPassword || crypto.randomBytes(32).toString('hex'),
        distFile: path.join(PAYROLL_DIR, 'dist', 'index.html'),
        trustProxy: true,
        basePath: PAYROLL_PATH,
        ssoUser,
      });
    })().catch((err) => {
      ready = undefined; // lần sau thử lại
      throw err;
    }));

  router.use(async (req, res, next) => {
    try {
      (await load())(req, res, next);
    } catch (err) {
      next(err);
    }
  });
  return router;
}
