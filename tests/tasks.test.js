import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { repeatDates } from '../src/modules/tasks/tasks.service.js';

const today = todayISO();
const { agent: admin } = await setup();
await loginAsAdmin(admin);

// Hai nhân viên: Lan và Minh
for (const [name, email] of [['Trần Lan', 'lan@test.local'], ['Lê Minh', 'minh@test.local']]) {
  await postForm(admin, '/staff', { name, email, role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
}
const staffId = async (name) => {
  const row = (await admin.get('/staff')).text.split('<tr>').slice(1).find((r) => r.includes(name));
  return Number(row.match(/\/staff\/(\d+)\/edit/)[1]);
};
const lanId = await staffId('Trần Lan');
const minhId = await staffId('Lê Minh');

const { agent: lan } = await setup();
await loginAs(lan, { email: 'lan@test.local', password: 'mat-khau-123' });

const assign = (agent, data) =>
  postForm(agent, '/tasks', { date: today, priority: 'normal', repeat: 'none', ...data }, { from: '/tasks/new' });
const taskIdOn = async (agent, url, title) => {
  const html = (await agent.get(url)).text;
  const item = html.split('<li class="card').slice(1).find((part) => part.includes(title));
  return item.match(/\/tasks\/(\d+)\/(?:edit|status)/)[1];
};

test('quản lý giao việc cho nhân viên -> nhân viên thấy trong "Hôm nay"', async () => {
  const res = await assign(admin, { title: 'Kiểm kê kho', assignee_id: lanId, start_time: '08:00', end_time: '09:30', note: 'Tầng 2' });
  assert.equal(res.status, 302);
  const page = (await lan.get('/today')).text;
  assert.match(page, /Kiểm kê kho/);
  assert.match(page, /08:00/);
  assert.match(page, /Tầng 2/);
  assert.doesNotMatch((await admin.get(`/today?user=${minhId}`)).text, />Kiểm kê kho<\/h3>/);
});

test('thiếu tên, giờ kết thúc trước giờ bắt đầu, người nhận không tồn tại -> báo lỗi', async () => {
  const noTitle = await assign(admin, { title: '', assignee_id: lanId, note: 'giữ lại ghi chú' });
  assert.equal(noTitle.status, 422);
  assert.match(noTitle.text, /Vui lòng nhập tên công việc/);
  assert.match(noTitle.text, /giữ lại ghi chú/);

  const badTime = await assign(admin, { title: 'Họp', assignee_id: lanId, start_time: '10:00', end_time: '09:00' });
  assert.equal(badTime.status, 422);
  assert.match(badTime.text, /Giờ kết thúc phải sau giờ bắt đầu/);

  const ghost = await assign(admin, { title: 'Ma', assignee_id: 99999 });
  assert.equal(ghost.status, 422);
  assert.match(ghost.text, /không tồn tại/);
});

test('việc lặp lại Thứ 2–6 tạo đúng số ngày', async () => {
  const start = '2026-11-02'; // Thứ 2
  const res = await assign(admin, { title: 'Báo cáo sáng', assignee_id: minhId, date: start, repeat: 'weekdays', repeat_until: '2026-11-15' });
  assert.equal(res.status, 302);
  const cal = (await admin.get(`/calendar?month=2026-11&user=${minhId}`)).text;
  assert.equal(cal.match(/Báo cáo sáng/g).length >= 10, true);
  assert.doesNotMatch((await admin.get(`/today?date=2026-11-07&user=${minhId}`)).text, /Báo cáo sáng/); // Thứ 7
});

test('quy tắc lặp lại', () => {
  assert.deepEqual(repeatDates('2026-11-02', 'none'), { dates: ['2026-11-02'] });
  assert.equal(repeatDates('2026-11-02', 'daily', '2026-11-08').dates.length, 7);
  assert.deepEqual(repeatDates('2026-11-02', 'weekly', '2026-11-16').dates, ['2026-11-02', '2026-11-09', '2026-11-16']);
  assert.ok(repeatDates('2026-11-02', 'daily').error);
  assert.ok(repeatDates('2026-11-02', 'daily', '2026-11-01').error);
  assert.ok(repeatDates('2026-01-01', 'daily', '2026-12-31').error); // quá 3 tháng
});

test('nhân viên tự thêm việc cho mình (dù cố gửi id người khác)', async () => {
  const res = await assign(lan, { title: 'Gọi khách hàng A', assignee_id: minhId });
  assert.equal(res.status, 302);
  assert.match((await lan.get('/today')).text, /Gọi khách hàng A/);
  assert.doesNotMatch((await admin.get(`/today?user=${minhId}`)).text, />Gọi khách hàng A<\/h3>/);
});

test('nhân viên đánh dấu bắt đầu / xong việc được giao', async () => {
  const id = await taskIdOn(lan, '/today', 'Kiểm kê kho');
  const start = await postForm(lan, `/tasks/${id}/status`, { status: 'doing', back: '/today' }, { from: '/today' });
  assert.equal(start.status, 302);
  assert.match((await lan.get('/today')).text, /Đang làm/);

  await postForm(lan, `/tasks/${id}/status`, { status: 'done' }, { from: '/today' });
  assert.match((await lan.get('/today')).text, /Đã hoàn thành|Đã xong/);
});

test('nhân viên không sửa/xoá việc do quản lý giao, không đổi trạng thái việc người khác', async () => {
  const id = await taskIdOn(lan, '/today', 'Kiểm kê kho');
  assert.equal((await lan.get(`/tasks/${id}/edit`)).status, 403);
  assert.equal((await postForm(lan, `/tasks/${id}/delete`, {}, { from: '/today' })).status, 403);

  await assign(admin, { title: 'Việc của Minh', assignee_id: minhId });
  const minhTask = await taskIdOn(admin, `/today?user=${minhId}`, 'Việc của Minh');
  assert.equal((await postForm(lan, `/tasks/${minhTask}/status`, { status: 'done' }, { from: '/today' })).status, 403);
});

test('nhân viên sửa và xoá được việc tự tạo', async () => {
  const id = await taskIdOn(lan, '/today', 'Gọi khách hàng A');
  const edit = await postForm(lan, `/tasks/${id}`, { title: 'Gọi khách hàng B', date: today, priority: 'high', status: 'todo' }, { from: `/tasks/${id}/edit` });
  assert.equal(edit.status, 302);
  const page = (await lan.get('/today')).text;
  assert.match(page, /Gọi khách hàng B/);
  assert.match(page, /Quan trọng/);

  assert.equal((await postForm(lan, `/tasks/${id}/delete`, {}, { from: '/today' })).status, 302);
  assert.doesNotMatch((await lan.get('/today')).text, /Gọi khách hàng B/);
});

test('trạng thái sai -> 400; id lạ -> 404; chưa đăng nhập -> chuyển tới đăng nhập', async () => {
  const id = await taskIdOn(lan, '/today', 'Kiểm kê kho');
  assert.equal((await postForm(lan, `/tasks/${id}/status`, { status: 'hacked' }, { from: '/today' })).status, 400);
  assert.equal((await admin.get('/tasks/99999/edit')).status, 404);
  assert.equal((await admin.get('/tasks/abc/edit')).status, 404);

  const { agent: guest } = await setup();
  const res = await guest.get('/tasks/new');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/login/);
});

test('"back" chỉ cho phép đường dẫn nội bộ', async () => {
  const res = await assign(admin, { title: 'Chuyển hướng', assignee_id: lanId, back: 'https://evil.example' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/today/);
});

test('dữ liệu người dùng được escape (chống XSS)', async () => {
  await assign(admin, { title: '<script>alert(1)</script>', assignee_id: lanId, date: addDays(today, 1) });
  const res = await lan.get(`/today?date=${addDays(today, 1)}`);
  assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
  assert.match(res.text, /&lt;script&gt;/);
});
