import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { addDays, todayISO } from '../src/lib/dates.js';
import { buildRows, stats } from '../src/modules/performance/performance.service.js';

const today = todayISO();
const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Ngô Vy', email: 'vy@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const vyId = Number(
  (await admin.get('/staff')).text.split('<tr>').slice(1).find((r) => r.includes('Ngô Vy')).match(/\/staff\/(\d+)\/edit/)[1],
);
const { agent: vy } = await setup();
await loginAs(vy, { email: 'vy@test.local', password: 'mat-khau-123' });

test('chỉ quản trị viên xem được bảng hiệu suất; nhân viên bị chặn và không thấy menu', async () => {
  assert.equal((await vy.get('/performance')).status, 403);
  assert.doesNotMatch((await vy.get('/today')).text, /href="\/performance"/);
  const { agent: guest } = await setup();
  assert.equal((await guest.get('/performance')).status, 302);

  const page = await admin.get('/performance');
  assert.equal(page.status, 200);
  assert.match(page.text, /Hiệu suất tuần/);
  assert.match((await admin.get('/today')).text, /href="\/performance"/);
});

test('bảng hiện từng người với số việc và tỷ lệ hoàn thành của tuần', async () => {
  for (const title of ['Viết bài', 'Chụp ảnh']) {
    await postForm(admin, '/tasks', { title, assignee_id: vyId, date: today, repeat: 'none' }, { from: '/tasks/new' });
  }
  const html = (await vy.get('/today')).text;
  const id = html.split('<li class="card').slice(1).find((p) => p.includes('Viết bài')).match(/\/tasks\/(\d+)\/status/)[1];
  await postForm(vy, `/tasks/${id}/status`, { status: 'done' }, { from: '/today' });

  const page = (await admin.get('/performance')).text;
  const row = page.split('<tr>').find((r) => r.includes('Ngô Vy'));
  assert.match(row, /50%/);
  assert.match(row, /Hoàn thành của Ngô Vy/);
  // Màu thanh tiến độ được gắn đúng (50% = vàng), không lẫn chữ thừa trong class
  assert.match(row, /class="h-full rounded-full bg-sun-400" style="width: 50%"/);
  // Tuần khác chưa có việc
  const later = (await admin.get(`/performance?date=${addDays(today, 21)}`)).text;
  assert.match(later.split('<tr>').find((r) => r.includes('Ngô Vy')), /Chưa có việc tuần này/);
});

test('cách tính: đúng hạn / xong trễ / quá hạn / đang làm', () => {
  const t = (o) => ({ assignee_id: 1, date: '2026-10-27', status: 'todo', done_at: null, ...o });
  const s = stats(
    [
      t({ status: 'done', done_at: '2026-10-27 09:00:00' }), // xong đúng ngày
      t({ status: 'done', done_at: '2026-10-27 18:30:00' }), // 01:30 ngày 28 giờ VN -> trễ
      t({ status: 'doing' }), // ngày đã qua, đang làm -> quá hạn
      t({ date: '2026-10-29' }), // chưa tới ngày
    ],
    '2026-10-28',
  );
  assert.deepEqual(s, { total: 4, done: 2, onTime: 1, doneLate: 1, doing: 1, overdue: 1, completion: 50, onTimeRate: 50 });
  assert.equal(stats([], '2026-10-28').completion, null);
});

test('xếp hạng: hoàn thành cao lên trước, chưa có việc xuống cuối; so với tuần trước', () => {
  const users = [{ id: 1, name: 'An' }, { id: 2, name: 'Bình' }, { id: 3, name: 'Chi' }];
  const task = (assignee_id, status) => ({ assignee_id, status, date: '2026-10-27', done_at: status === 'done' ? '2026-10-27 01:00:00' : null });
  const rows = buildRows({
    users,
    tasks: [task(1, 'todo'), task(1, 'done'), task(2, 'done')],
    prevTasks: [task(2, 'todo'), task(2, 'done')],
    today: '2026-10-28',
  });
  assert.deepEqual(rows.map((r) => r.name), ['Bình', 'An', 'Chi']);
  assert.equal(rows[0].change, 50); // 100% so với 50% tuần trước
  assert.equal(rows[1].change, null); // tuần trước không có việc
});
