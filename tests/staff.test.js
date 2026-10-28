import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);

const addStaff = (data) =>
  postForm(admin, '/staff', { role: 'member', password: 'mat-khau-123', ...data }, { from: '/staff/new' });
const idOf = async (name) => {
  const html = (await admin.get('/staff')).text;
  const row = html.split('<tr>').slice(1).find((r) => r.includes(name));
  return row.match(/\/staff\/(\d+)\/edit/)[1];
};

test('quản lý thấy danh sách nhân viên, có chính mình', async () => {
  const res = await admin.get('/staff');
  assert.equal(res.status, 200);
  assert.match(res.text, /Quản trị viên/);
  assert.match(res.text, /\(bạn\)/);
});

test('thêm nhân viên hợp lệ rồi nhân viên đó đăng nhập được', async () => {
  const res = await addStaff({ name: 'Nguyễn An', email: 'an@test.local' });
  assert.equal(res.status, 302);
  assert.match((await admin.get('/staff')).text, /Nguyễn An/);

  const { agent: an } = await setup();
  await loginAs(an, { email: 'an@test.local', password: 'mat-khau-123' });
  assert.equal((await an.get('/today')).status, 200);
});

test('email trùng, mật khẩu ngắn, thiếu tên -> báo lỗi', async () => {
  const dup = await addStaff({ name: 'Trùng', email: 'AN@test.local' });
  assert.equal(dup.status, 422);
  assert.match(dup.text, /đã được sử dụng/);

  const short = await addStaff({ name: 'Bình', email: 'binh@test.local', password: '123' });
  assert.equal(short.status, 422);
  assert.match(short.text, /tối thiểu 8 ký tự/);

  const noName = await addStaff({ name: ' ', email: 'x@test.local' });
  assert.equal(noName.status, 422);
  assert.match(noName.text, /Vui lòng nhập họ tên/);
});

test('nhân viên không vào được trang quản lý nhân viên', async () => {
  const { agent: an } = await setup();
  await loginAs(an, { email: 'an@test.local', password: 'mat-khau-123' });
  assert.equal((await an.get('/staff')).status, 403);
  const res = await postForm(an, '/staff', { name: 'Hack', email: 'h@test.local', password: '12345678', role: 'admin' }, { from: '/today' });
  assert.equal(res.status, 403);
  assert.doesNotMatch((await an.get('/today')).text, /href="\/staff"/); // không có menu Nhân viên
});

test('sửa tên và đổi mật khẩu; để trống mật khẩu thì giữ nguyên', async () => {
  const id = await idOf('Nguyễn An');
  const keep = await postForm(admin, `/staff/${id}`, { name: 'Nguyễn Văn An', email: 'an@test.local', role: 'member', password: '' }, { from: `/staff/${id}/edit` });
  assert.equal(keep.status, 302);
  assert.match((await admin.get('/staff')).text, /Nguyễn Văn An/);

  await postForm(admin, `/staff/${id}`, { name: 'Nguyễn Văn An', email: 'an@test.local', role: 'member', password: 'mat-khau-moi-1' }, { from: `/staff/${id}/edit` });
  const { agent: an } = await setup();
  await loginAs(an, { email: 'an@test.local', password: 'mat-khau-moi-1' });
});

test('quản lý không tự bỏ quyền hay tự xoá mình', async () => {
  const id = await idOf('Quản trị viên');
  const demote = await postForm(admin, `/staff/${id}`, { name: 'Quản trị viên', email: 'admin@test.local', role: 'member' }, { from: `/staff/${id}/edit` });
  assert.equal(demote.status, 422);
  assert.match(demote.text, /không thể tự bỏ quyền/);

  const del = await postForm(admin, `/staff/${id}/delete`, {}, { from: '/staff' });
  assert.equal(del.status, 403);
});

test('xoá nhân viên', async () => {
  await addStaff({ name: 'Người tạm', email: 'tam@test.local' });
  const id = await idOf('Người tạm');
  const res = await postForm(admin, `/staff/${id}/delete`, {}, { from: '/staff' });
  assert.equal(res.status, 302);
  assert.doesNotMatch((await admin.get('/staff')).text, /Người tạm/);
});

test('id lạ -> 404', async () => {
  assert.equal((await admin.get('/staff/99999/edit')).status, 404);
  assert.equal((await admin.get('/staff/abc/edit')).status, 404);
});
