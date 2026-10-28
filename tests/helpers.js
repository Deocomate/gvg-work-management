// Công cụ dùng chung cho test. Mỗi file test có DB riêng trong bộ nhớ.
// Phải đặt biến môi trường TRƯỚC khi import app (config đọc env lúc import).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';
process.env.SESSION_SECRET = 'test-secret';

// Tài khoản admin cho test (chỉ có tác dụng khi dự án gắn addon auth).
export const TEST_ADMIN = { email: 'admin@test.local', password: 'test-password-123' };
process.env.ADMIN_EMAIL = TEST_ADMIN.email;
process.env.ADMIN_PASSWORD = TEST_ADMIN.password;

const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { runMigrations } = await import('../src/db/migrate.js');

let ready;

/** Tạo app đã chạy migration + một "trình duyệt" giữ cookie (agent). */
export async function setup() {
  ready ??= runMigrations({ log: () => {} });
  await ready;
  const app = createApp();
  return { app, agent: request.agent(app) };
}

/** Lấy CSRF token từ HTML của một trang có form. */
export async function csrfToken(agent, path = '/') {
  const res = await agent.get(path).redirects(3);
  const match = res.text.match(/name="csrf-token" content="([^"]+)"/);
  if (!match) throw new Error(`Không thấy csrf-token ở ${path}`);
  return match[1];
}

/** Gửi form POST kèm CSRF như trình duyệt thật. */
export async function postForm(agent, path, data = {}, { from = '/' } = {}) {
  const _csrf = await csrfToken(agent, from);
  return agent.post(path).type('form').send({ ...data, _csrf });
}
