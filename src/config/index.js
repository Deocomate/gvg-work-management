// Đọc cấu hình từ biến môi trường ở MỘT chỗ duy nhất.
// Code khác chỉ import `config`, không đọc process.env trực tiếp.

import crypto from 'node:crypto';

const env = process.env;
const DEV_SECRET = 'dev-only-secret-change-me';

const nodeEnv = env.NODE_ENV ?? 'development';
// "a, b ,c" -> ['a', 'b', 'c']
const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = Object.freeze({
  env: nodeEnv,
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  onRender: Boolean(env.RENDER), // Render tự đặt biến RENDER
  port: Number(env.PORT ?? 3000),
  appName: env.APP_NAME ?? 'Work Calendar',
  timezone: env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
  locale: env.APP_LOCALE || 'vi-VN',
  sessionSecret: env.SESSION_SECRET ?? DEV_SECRET,
  db: Object.freeze({
    // Local: file SQLite. Production free: Turso (libsql://...), cùng API.
    url: env.DATABASE_URL || 'file:data/app.db',
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  }),
  auth: Object.freeze({
    adminEmail: env.ADMIN_EMAIL || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    allowSignup: env.ALLOW_SIGNUP === 'true',
  }),
  // Quảng cáo Facebook / TikTok (trang /ads, chỉ quản lý xem).
  ads: Object.freeze({
    cacheMinutes: Math.max(1, Number(env.ADS_CACHE_MINUTES) || 15),
    meta: Object.freeze({
      token: env.META_ACCESS_TOKEN || undefined,
      accountIds: list(env.META_AD_ACCOUNT_IDS).map((id) => id.replace(/^act_/, '')),
      apiVersion: env.META_API_VERSION || 'v21.0',
    }),
    tiktok: Object.freeze({
      token: env.TIKTOK_ACCESS_TOKEN || undefined,
      advertiserIds: list(env.TIKTOK_ADVERTISER_IDS),
    }),
  }),
  // Chấm công & tính lương (/luong): app riêng có mã hoá riêng (src/payroll).
  // Vào bằng tài khoản lịch công việc (Quản lý = chủ cửa hàng). PAYROLL_ADMIN_PASSWORD không bắt buộc:
  // chỉ cần khi muốn đăng nhập riêng bằng tên "admin". Secret: PAYROLL_SESSION_SECRET, không có thì suy ra
  // từ SESSION_SECRET (khi đó KHÔNG được đổi SESSION_SECRET nữa, vì nó tạo khoá khôi phục dữ liệu lương).
  payroll: Object.freeze({
    adminUsername: env.PAYROLL_ADMIN_USERNAME || 'admin',
    adminPassword: env.PAYROLL_ADMIN_PASSWORD || undefined,
    sessionSecret:
      env.PAYROLL_SESSION_SECRET ||
      (nodeEnv === 'test'
        ? undefined
        : crypto.createHmac('sha256', env.SESSION_SECRET ?? DEV_SECRET).update('payroll-secret').digest('hex')),
    dbFile: env.PAYROLL_DB_FILE || 'data/payroll.db',
  }),
  // [vibe:config]
});

if (config.isProd && config.sessionSecret === DEV_SECRET) {
  throw new Error('SESSION_SECRET chưa được đặt cho môi trường production.');
}
