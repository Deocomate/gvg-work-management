import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Lê Mai', email: 'mai@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });

const addLink = (data) => postForm(admin, '/links', data, { from: '/links/new' });
const idOf = async (title) => {
  const row = (await admin.get('/links')).text.split('<tr>').slice(1).find((r) => r.includes(title));
  return row.match(/\/links\/(\d+)\/edit/)[1];
};

test('chưa có link: quản lý thấy lời mời thêm, nhân viên không thấy khung', async () => {
  assert.match((await admin.get('/today')).text, /Thêm link đầu tiên/);
  assert.doesNotMatch((await mai.get('/today')).text, /Tài liệu cần thiết/);
});

test('quản lý thêm link -> mọi người thấy ở trang Hôm nay, mở tab mới', async () => {
  const res = await addLink({ title: 'Quy trình nghỉ phép', url: 'https://drive.google.com/abc', note: 'Đọc trước khi xin nghỉ' });
  assert.equal(res.status, 302);

  const home = (await mai.get('/').redirects(5)).text;
  assert.match(home, /Tài liệu cần thiết/);
  assert.match(home, /Quy trình nghỉ phép/);
  assert.match(home, /href="https:\/\/drive.google.com\/abc" target="_blank" rel="noopener noreferrer"/);
});

test('thiếu tên, link sai hoặc link "javascript:" -> báo lỗi', async () => {
  const noTitle = await addLink({ title: ' ', url: 'https://a.vn' });
  assert.equal(noTitle.status, 422);
  assert.match(noTitle.text, /Vui lòng nhập tên tài liệu/);

  for (const url of ['drive.google.com/abc', 'javascript:alert(1)', 'ftp://a.vn/x']) {
    const bad = await addLink({ title: 'Lỗi', url });
    assert.equal(bad.status, 422, url);
    assert.match(bad.text, /http:\/\/ hoặc https:\/\//);
  }
});

test('sửa và xoá link', async () => {
  const id = await idOf('Quy trình nghỉ phép');
  const edit = await postForm(admin, `/links/${id}`, { title: 'Quy trình nghỉ phép 2026', url: 'https://drive.google.com/xyz', note: '' }, { from: `/links/${id}/edit` });
  assert.equal(edit.status, 302);
  assert.match((await mai.get('/today')).text, /Quy trình nghỉ phép 2026/);

  const del = await postForm(admin, `/links/${id}/delete`, {}, { from: '/links' });
  assert.equal(del.status, 302);
  assert.doesNotMatch((await mai.get('/today')).text, /Quy trình nghỉ phép/);
});

test('nhân viên không vào được trang quản lý link', async () => {
  assert.equal((await mai.get('/links')).status, 403);
  const res = await postForm(mai, '/links', { title: 'Hack', url: 'https://x.vn' }, { from: '/today' });
  assert.equal(res.status, 403);
  assert.doesNotMatch((await mai.get('/today')).text, /href="\/links"/);
});

test('id lạ -> 404', async () => {
  assert.equal((await admin.get('/links/99999/edit')).status, 404);
  assert.equal((await admin.get('/links/abc/edit')).status, 404);
  assert.equal((await postForm(admin, '/links/99999/delete', {}, { from: '/links' })).status, 404);
});
