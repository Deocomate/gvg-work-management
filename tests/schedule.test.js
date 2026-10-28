import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { addDays, monthGrid, todayISO } from '../src/lib/dates.js';
import { timing } from '../src/modules/schedule/schedule.service.js';

const today = todayISO();
const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Phạm Hoa', email: 'hoa@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const hoaId = Number(
  (await admin.get('/staff')).text.split('<tr>').slice(1).find((r) => r.includes('Phạm Hoa')).match(/\/staff\/(\d+)\/edit/)[1],
);
const { agent: hoa } = await setup();
await loginAs(hoa, { email: 'hoa@test.local', password: 'mat-khau-123' });

const assign = (data) =>
  postForm(admin, '/tasks', { assignee_id: hoaId, date: today, priority: 'normal', repeat: 'none', ...data }, { from: '/tasks/new' });

test('mở app chưa đăng nhập -> trang đăng nhập; đăng nhập rồi -> Hôm nay', async () => {
  const { agent: guest } = await setup();
  const res = await guest.get('/').redirects(5);
  assert.match(res.text, /Đăng nhập/);
  const home = await hoa.get('/').redirects(5);
  assert.match(home.text, /Việc hôm nay/);
});

test('ngày chưa có việc hiện trạng thái rỗng; ngày sai định dạng quay về hôm nay', async () => {
  const empty = await hoa.get(`/today?date=${addDays(today, 30)}`);
  assert.match(empty.text, /Không có việc nào trong ngày này/);
  const bad = await hoa.get('/today?date=2026-02-31');
  assert.equal(bad.status, 200);
  assert.match(bad.text, /Việc hôm nay/);
});

test('dòng thời gian: việc cả ngày trước, rồi theo giờ; có tiến độ', async () => {
  await assign({ title: 'Họp chiều', start_time: '14:00', end_time: '15:00' });
  await assign({ title: 'Họp sáng', start_time: '08:00' });
  await assign({ title: 'Dọn kho', priority: 'high' });
  const html = (await hoa.get('/today')).text;
  const order = ['Dọn kho', 'Họp sáng', 'Họp chiều'].map((t) => html.indexOf(t));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /Đã xong <span[^>]*>0<\/span>\/3 việc/);
  assert.match(html, /Quan trọng/);
});

test('menu hiện số việc chưa xong hôm nay', async () => {
  const html = (await hoa.get('/calendar')).text;
  assert.match(html, /title="3 việc chưa xong hôm nay"/);
});

test('việc hôm qua chưa xong được nhắc ở "Hôm nay"', async () => {
  await assign({ title: 'Việc tồn hôm qua', date: addDays(today, -1) });
  const html = (await hoa.get('/today')).text;
  assert.match(html, /Còn 1 việc chưa xong từ những ngày trước/);
  assert.match(html, /Việc tồn hôm qua/);
});

test('lịch tháng hiện việc theo ngày và đánh dấu ngày còn việc trễ', async () => {
  const html = (await hoa.get(`/calendar?month=${today.slice(0, 7)}`)).text;
  assert.match(html, /Họp sáng/);
  assert.match(html, /T2[\s\S]*CN/);
  assert.ok((await hoa.get('/calendar?month=abc')).status === 200);
});

test('nhân viên chỉ thấy việc của mình kể cả khi sửa ?user=', async () => {
  await postForm(admin, '/tasks', { assignee_id: 1, date: today, title: 'Việc riêng của quản lý', repeat: 'none' }, { from: '/tasks/new' });
  const html = (await hoa.get('/today?user=1')).text;
  assert.doesNotMatch(html, /Việc riêng của quản lý/);
  assert.doesNotMatch(html, /Tất cả nhân viên/);
  // Quản lý xem "tất cả" thấy cả hai, kèm tên người làm
  const all = (await admin.get('/today')).text;
  assert.match(all, /Việc riêng của quản lý/);
  assert.match(all, /Người làm: <span[^>]*>Phạm Hoa/);
});

test('trạng thái "đang diễn ra" và "trễ" theo giờ hiện tại', () => {
  const t = (o) => ({ date: '2026-10-28', status: 'todo', start_time: null, end_time: null, ...o });
  const at = (task, now) => timing(task, '2026-10-28', now);
  assert.deepEqual(at(t({ start_time: '08:00', end_time: '10:00' }), '09:00'), { isNow: true, isLate: false });
  assert.deepEqual(at(t({ start_time: '08:00', end_time: '10:00' }), '10:30'), { isNow: false, isLate: true });
  assert.deepEqual(at(t({ start_time: '08:00', end_time: '10:00', status: 'done' }), '10:30'), { isNow: false, isLate: false });
  assert.deepEqual(at(t({ date: '2026-10-27' }), '07:00'), { isNow: false, isLate: true });
  assert.deepEqual(at(t({}), '23:00'), { isNow: false, isLate: false }); // việc cả ngày không bị tính trễ trong ngày
});

test('lưới lịch bắt đầu Thứ 2, đủ tuần', () => {
  const weeks = monthGrid('2026-10'); // 1/10/2026 là Thứ 5
  assert.equal(weeks[0][0], '2026-09-28');
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks.at(-1)[6], '2026-11-01');
});
