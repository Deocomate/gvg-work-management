import { test } from 'node:test';
import assert from 'node:assert/strict';

// Đặt biến môi trường trước khi nạp app.
process.env.ALLOW_SIGNUP = 'true';
const { setup, postForm, TEST_ADMIN } = await import('./helpers.js');
const { loginAsAdmin } = await import('./auth-helpers.js');
const { requireAuth } = await import('../src/middleware/auth.js');

const { agent } = await setup();

test('trang đăng nhập hiển thị', async () => {
  const res = await agent.get('/login');
  assert.equal(res.status, 200);
  assert.match(res.text, /Đăng nhập/);
});

test('sai mật khẩu -> báo lỗi chung, không lộ email có tồn tại hay không', async () => {
  const res = await postForm(agent, '/login', { email: TEST_ADMIN.email, password: 'sai' }, { from: '/login' });
  assert.equal(res.status, 422);
  assert.match(res.text, /Email hoặc mật khẩu không đúng/);
});

test('admin đăng nhập, thấy tên trên menu, rồi đăng xuất', async () => {
  await loginAsAdmin(agent);
  const home = await agent.get('/').redirects(5); // trang chủ có thể chuyển hướng tới module chính
  assert.match(home.text, /Đăng xuất/);

  const out = await postForm(agent, '/logout', {}, { from: '/' });
  assert.equal(out.status, 302);
  assert.match((await agent.get('/').redirects(5)).text, /href="\/login"/);
});

test('đăng ký tài khoản mới (khi ALLOW_SIGNUP=true)', async () => {
  const res = await postForm(
    agent,
    '/signup',
    { name: 'Nhân viên A', email: 'a@test.local', password: '12345678' },
    { from: '/signup' },
  );
  assert.equal(res.status, 302);
  const dup = await postForm(
    agent,
    '/signup',
    { name: 'Trùng', email: 'A@test.local', password: '12345678' },
    { from: '/signup' },
  );
  assert.equal(dup.status, 422);
  assert.match(dup.text, /đã được sử dụng/);
});

test('next chỉ chuyển hướng nội bộ (chống open redirect)', async () => {
  const res = await postForm(
    agent,
    '/login',
    { ...TEST_ADMIN, next: 'https://evil.example' },
    { from: '/login' },
  );
  assert.equal(res.headers.location, '/');
});

test('requireAuth chuyển người chưa đăng nhập tới /login', () => {
  let redirectedTo = null;
  const req = { user: null, method: 'GET', originalUrl: '/bao-cao', flash: () => {} };
  const res = { redirect: (url) => (redirectedTo = url) };
  requireAuth(req, res, () => assert.fail('không được cho qua'));
  assert.equal(redirectedTo, '/login?next=%2Fbao-cao');
});
