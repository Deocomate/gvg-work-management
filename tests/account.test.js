import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(
  admin,
  '/staff',
  { name: 'Phạm Thu', email: 'thu@test.local', phone: '0912 000 111', role: 'member', password: 'mat-khau-123' },
  { from: '/staff/new' },
);
const { agent: thu } = await setup();
await loginAs(thu, { email: 'thu@test.local', password: 'mat-khau-123' });

test('nhân viên thấy nút Cài đặt và trang Tài khoản của mình, không thấy tab quản lý', async () => {
  assert.match((await thu.get('/today')).text, /href="\/account"[^>]*aria-label="Cài đặt"/);
  const page = await thu.get('/account');
  assert.equal(page.status, 200);
  assert.match(page.text, /thu@test\.local/);
  assert.match(page.text, /0912 000 111/);
  assert.doesNotMatch(page.text, /href="\/staff"/);
  assert.doesNotMatch(page.text, /href="\/performance"/);

  assert.match((await admin.get('/account')).text, /href="\/staff"/);
  const { agent: guest } = await setup();
  assert.equal((await guest.get('/account')).status, 302);
});

test('sửa họ tên, số điện thoại; tên trống thì báo lỗi', async () => {
  const bad = await postForm(thu, '/account', { name: '', phone: '' }, { from: '/account' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Vui lòng nhập họ tên/);

  const ok = await postForm(thu, '/account', { name: 'Phạm Minh Thu', phone: '0988 777 666' }, { from: '/account' });
  assert.equal(ok.status, 302);
  const page = (await thu.get('/account')).text;
  assert.match(page, /Phạm Minh Thu/);
  assert.match(page, /0988 777 666/);
});

test('đổi mật khẩu: sai mật khẩu cũ / nhập lại không khớp bị chặn; đúng thì đăng nhập bằng mật khẩu mới', async () => {
  const wrong = await postForm(
    thu,
    '/account/password',
    { current_password: 'sai-roi-123', new_password: 'mat-khau-moi-1', confirm_password: 'mat-khau-moi-1' },
    { from: '/account' },
  );
  assert.equal(wrong.status, 422);
  assert.match(wrong.text, /Mật khẩu hiện tại không đúng/);

  const mismatch = await postForm(
    thu,
    '/account/password',
    { current_password: 'mat-khau-123', new_password: 'mat-khau-moi-1', confirm_password: 'khac-nhau-1' },
    { from: '/account' },
  );
  assert.equal(mismatch.status, 422);
  assert.match(mismatch.text, /không khớp/);

  const ok = await postForm(
    thu,
    '/account/password',
    { current_password: 'mat-khau-123', new_password: 'mat-khau-moi-1', confirm_password: 'mat-khau-moi-1' },
    { from: '/account' },
  );
  assert.equal(ok.status, 302);

  const { agent: again } = await setup();
  await loginAs(again, { email: 'thu@test.local', password: 'mat-khau-moi-1' });
});
