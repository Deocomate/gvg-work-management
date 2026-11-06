import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { todayISO, addDays } from '../src/lib/dates.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);
for (const [name, email] of [['Lê Mai', 'mai@test.local'], ['Trần Nam', 'nam@test.local']]) {
  await postForm(admin, '/staff', { name, email, role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
}
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });
const { agent: nam } = await setup();
await loginAs(nam, { email: 'nam@test.local', password: 'mat-khau-123' });

const add = (agent, data) => postForm(agent, '/plan', data, { from: '/plan/new' });
const idOf = async (title) => {
  const row = (await admin.get('/plan?status=all')).text.split('data-plan-row').slice(1).find((r) => r.includes(title));
  return row.match(/\/plan\/(\d+)\/edit/)[1];
};
const month = todayISO().slice(0, 7);

test('menu có tab Plan, Idea bank trống thì có hướng dẫn', async () => {
  const page = await mai.get('/plan');
  assert.equal(page.status, 200);
  assert.match(page.text, /href="\/plan"/);
  assert.match(page.text, /Kho ý tưởng đang trống/);
  assert.match(page.text, /Lịch quay \/ đăng/);
});

test('chưa đăng nhập -> về trang đăng nhập', async () => {
  const { agent } = await setup();
  const res = await agent.get('/plan');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/login/);
});

test('nhân viên thêm ý tưởng không có ngày -> nằm trong Idea bank "Chưa lên lịch"', async () => {
  const res = await add(mai, { title: 'Hậu trường nung gốm', platform: 'tiktok', topic: 'Hậu trường', description: 'Hook: lò 1200 độ' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/plan');

  const page = (await nam.get('/plan')).text;
  assert.match(page, /Hậu trường nung gốm/);
  assert.match(page, /Ý tưởng/);
  // Tìm không dấu
  assert.match((await nam.get('/plan?q=hau+truong+nung')).text, /Hậu trường nung gốm/);
  assert.doesNotMatch((await nam.get('/plan?q=khong+co')).text, /Hậu trường nung gốm/);
  // Lọc theo nhóm và kênh
  assert.match((await nam.get('/plan?topic=Hậu%20trường')).text, /Hậu trường nung gốm/);
  assert.doesNotMatch((await nam.get('/plan?platform=facebook')).text, /Hậu trường nung gốm/);
});

test('thiếu tên, link sai, ngày đăng trước ngày quay -> báo lỗi, giữ dữ liệu đã nhập', async () => {
  const noTitle = await add(mai, { title: ' ', description: 'Giữ lại nội dung này' });
  assert.equal(noTitle.status, 422);
  assert.match(noTitle.text, /Vui lòng nhập tên ý tưởng/);
  assert.match(noTitle.text, /Giữ lại nội dung này/);

  const badUrl = await add(mai, { title: 'X', reference_url: 'javascript:alert(1)' });
  assert.equal(badUrl.status, 422);
  assert.match(badUrl.text, /http:\/\/ hoặc https:\/\//);

  const badDates = await add(mai, { title: 'X', shoot_date: addDays(todayISO(), 3), post_date: todayISO() });
  assert.equal(badDates.status, 422);
  assert.match(badDates.text, /Ngày đăng phải sau hoặc cùng ngày quay/);
});

test('gắn ngày quay/đăng -> tự thành "Đã lên lịch" và hiện trên lịch tháng', async () => {
  const today = todayISO();
  const res = await add(admin, { title: 'Review bình hoa men lam', platform: 'facebook', shoot_date: today, post_date: today, post_time: '20:00' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/plan/calendar?month=${month}`);

  const cal = (await mai.get('/plan/calendar')).text;
  assert.match(cal, /Review bình hoa men lam/);
  assert.match(cal, /🎬 1 buổi quay/);
  assert.match(cal, /📤 1 bài cần đăng/);
  assert.match(cal, /20:00/);
  assert.match(cal.split('data-plan-agenda')[1], /Review bình hoa men lam/); // danh sách theo ngày cho điện thoại
  // Đã có lịch -> không còn ở "Chưa lên lịch"
  assert.doesNotMatch((await mai.get('/plan')).text, /Review bình hoa men lam/);
  assert.match((await mai.get('/plan?status=scheduled')).text, /Review bình hoa men lam/);
});

test('bấm + ở một ngày -> form điền sẵn ngày đăng', async () => {
  const day = addDays(todayISO(), 2);
  const page = await mai.get(`/plan/new?post_date=${day}`);
  assert.equal(page.status, 200);
  assert.match(page.text, new RegExp(`name="post_date" type="date" value="${day}"`));
});

test('lịch tháng khác: tháng sai -> về tháng này', async () => {
  assert.equal((await mai.get('/plan/calendar?month=2026-13')).status, 200);
  assert.match((await mai.get('/plan/calendar?month=2030-01')).text, /Tháng 1\/2030/);
});

test('đổi nhanh trạng thái Đã quay / Đã đăng', async () => {
  const id = await idOf('Hậu trường nung gốm');
  const res = await postForm(mai, `/plan/${id}/status`, { status: 'posted', back: '/plan?status=posted' }, { from: '/plan' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/plan?status=posted');
  assert.match((await mai.get('/plan?status=posted')).text, /Hậu trường nung gốm/);

  const bad = await postForm(mai, `/plan/${id}/status`, { status: 'hack' }, { from: '/plan' });
  assert.equal(bad.status, 302);
});

test('quyền: người khác không sửa/xoá được ý tưởng của mình; người phụ trách sửa được, không xoá được', async () => {
  const id = await idOf('Hậu trường nung gốm'); // Mai tạo
  assert.equal((await nam.get(`/plan/${id}/edit`)).status, 403);
  assert.equal((await postForm(nam, `/plan/${id}`, { title: 'Hack' }, { from: '/plan' })).status, 403);
  assert.equal((await postForm(nam, `/plan/${id}/status`, { status: 'dropped' }, { from: '/plan' })).status, 403);
  assert.equal((await postForm(nam, `/plan/${id}/delete`, {}, { from: '/plan' })).status, 403);

  // Quản lý giao cho Nam phụ trách
  const namId = (await admin.get(`/plan/${id}/edit`)).text.match(/<option value="(\d+)"[^>]*>Trần Nam</)[1];
  const edit = await postForm(admin, `/plan/${id}`, { title: 'Hậu trường nung gốm', platform: 'tiktok', status: 'idea', owner_id: namId }, { from: `/plan/${id}/edit` });
  assert.equal(edit.status, 302);

  assert.equal((await nam.get(`/plan/${id}/edit`)).status, 200);
  assert.equal((await postForm(nam, `/plan/${id}`, { title: 'Hậu trường nung gốm (bản Nam)', platform: 'tiktok' }, { from: '/plan' })).status, 302);
  assert.equal((await postForm(nam, `/plan/${id}/delete`, {}, { from: '/plan' })).status, 403);
  assert.match((await mai.get('/plan')).text, /bản Nam/);
});

test('người tạo xoá được; id lạ -> 404', async () => {
  const id = await idOf('bản Nam');
  const del = await postForm(mai, `/plan/${id}/delete`, {}, { from: '/plan' });
  assert.equal(del.status, 302);
  assert.ok(!(await mai.get('/plan?status=all')).text.split('data-plan-row').slice(1).some((r) => r.includes('bản Nam')));

  assert.equal((await admin.get('/plan/99999/edit')).status, 404);
  assert.equal((await admin.get('/plan/abc/edit')).status, 404);
  assert.equal((await postForm(admin, '/plan/99999/delete', {}, { from: '/plan' })).status, 404);
});

test('link quay lại không cho trỏ ra ngoài app', async () => {
  const res = await add(mai, { title: 'Ý tưởng an toàn', back: 'https://evil.example' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/plan');
});
