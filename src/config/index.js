// Đọc cấu hình từ biến môi trường ở MỘT chỗ duy nhất.
// Code khác chỉ import `config`, không đọc process.env trực tiếp.

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
  // Quảng cáo Facebook / TikTok (trang /ads). Chỉ email trong ADS_VIEWER_EMAILS xem được.
  ads: Object.freeze({
    viewerEmails: list(env.ADS_VIEWER_EMAILS).map((e) => e.toLowerCase()),
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
  // [vibe:config]
});

if (config.isProd && config.sessionSecret === DEV_SECRET) {
  throw new Error('SESSION_SECRET chưa được đặt cho môi trường production.');
}
