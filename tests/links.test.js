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

test('chưa có link: quản lý thấy nút thêm, nhân viên chỉ thấy trang trống', async () => {
  assert.match((await admin.get('/links')).text, /href="\/links\/new"/);
  const page = await mai.get('/links');
  assert.equal(page.status, 200);
  assert.match(page.text, /Chưa có link tài liệu nào/);
  assert.doesNotMatch(page.text, /href="\/links\/new"/);
});

test('quản lý thêm link -> mọi người thấy ở trang Tài liệu (mở tab mới), không hiện ở trang Hôm nay', async () => {
  const res = await addLink({ title: 'Quy trình nghỉ phép', url: 'https://drive.google.com/abc', note: 'Đọc trước khi xin nghỉ' });
  assert.equal(res.status, 302);

  const page = (await mai.get('/links')).text;
  assert.match(page, /Quy trình nghỉ phép/);
  assert.match(page, /href="https:\/\/drive.google.com\/abc" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(page, /\/links\/\d+\/edit/);

  const home = (await mai.get('/').redirects(5)).text;
  assert.match(home, /href="\/links"/);
  assert.doesNotMatch(home, /Quy trình nghỉ phép/);
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
  assert.match((await mai.get('/links')).text, /Quy trình nghỉ phép 2026/);

  const del = await postForm(admin, `/links/${id}/delete`, {}, { from: '/links' });
  assert.equal(del.status, 302);
  assert.doesNotMatch((await mai.get('/links')).text, /Quy trình nghỉ phép/);
});

test('nhân viên không thêm/sửa/xoá được link', async () => {
  await addLink({ title: 'Biểu mẫu', url: 'https://a.vn' });
  const id = await idOf('Biểu mẫu');
  assert.equal((await mai.get('/links/new')).status, 403);
  assert.equal((await mai.get(`/links/${id}/edit`)).status, 403);
  assert.equal((await postForm(mai, '/links', { title: 'Hack', url: 'https://x.vn' }, { from: '/links' })).status, 403);
  assert.equal((await postForm(mai, `/links/${id}`, { title: 'Hack', url: 'https://x.vn' }, { from: '/links' })).status, 403);
  assert.equal((await postForm(mai, `/links/${id}/delete`, {}, { from: '/links' })).status, 403);
  assert.match((await mai.get('/links')).text, /Biểu mẫu/);
});

test('id lạ -> 404', async () => {
  assert.equal((await admin.get('/links/99999/edit')).status, 404);
  assert.equal((await admin.get('/links/abc/edit')).status, 404);
  assert.equal((await postForm(admin, '/links/99999/delete', {}, { from: '/links' })).status, 404);
});
