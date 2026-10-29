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

test('link liên quan: mỗi dòng một link, hiện thành nút mở tab mới; sửa được', async () => {
  const res = await assign(admin, {
    title: 'Quay video mẫu',
    assignee_id: lanId,
    links: 'https://www.tiktok.com/@kenh/video/123\r\n\r\n  https://drive.google.com/drive/folders/abc  ',
  });
  assert.equal(res.status, 302);
  const page = (await lan.get('/today')).text;
  assert.match(page, /href="https:\/\/www\.tiktok\.com\/@kenh\/video\/123" target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /tiktok\.com\/@kenh\/video\/123 ↗/);
  assert.match(page, /href="https:\/\/drive\.google\.com\/drive\/folders\/abc"/);

  // Form sửa giữ link (mỗi dòng một link); xoá hết link -> không còn hiện
  const id = await taskIdOn(admin, `/today?user=${lanId}`, 'Quay video mẫu');
  const edit = (await admin.get(`/tasks/${id}/edit`)).text;
  assert.match(edit, /https:\/\/www\.tiktok\.com\/@kenh\/video\/123\nhttps:\/\/drive\.google\.com/);
  // Ghi chú nhiều dòng mở lại form sửa không bị chèn thêm dấu cách
  await assign(admin, { title: 'Ghi chú dài', assignee_id: lanId, note: 'Dòng 1\nDòng 2' });
  const noteId = await taskIdOn(admin, `/today?user=${lanId}`, 'Ghi chú dài');
  assert.match((await admin.get(`/tasks/${noteId}/edit`)).text, />Dòng 1\nDòng 2<\/textarea>/);
  await postForm(admin, `/tasks/${id}`, { title: 'Quay video mẫu', assignee_id: lanId, date: today, links: '' }, { from: `/tasks/${id}/edit` });
  assert.doesNotMatch((await lan.get('/today')).text, /tiktok\.com\/@kenh/);
});

test('link liên quan sai (không phải http/https, quá 10 link) -> báo lỗi, giữ lại nội dung', async () => {
  const bad = await assign(admin, { title: 'Việc có link xấu', assignee_id: lanId, links: 'https://ok.vn\njavascript:alert(1)' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Dòng 2: link phải bắt đầu bằng http:\/\/ hoặc https:\/\//);
  assert.match(bad.text, /javascript:alert\(1\)<\/textarea>/);

  const many = Array.from({ length: 11 }, (_, i) => `https://a.vn/${i}`).join('\n');
  const tooMany = await assign(admin, { title: 'Nhiều link', assignee_id: lanId, links: many });
  assert.equal(tooMany.status, 422);
  assert.match(tooMany.text, /Tối đa 10 link/);
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
  const res = await assign(admin, {
    title: 'Báo cáo sáng',
    assignee_id: minhId,
    date: start,
    repeat: 'weekly',
    repeat_days: ['1', '2', '3', '4', '5'],
    repeat_until: '2026-11-15',
  });
  assert.equal(res.status, 302);
  const cal = (await admin.get(`/calendar?month=2026-11&user=${minhId}`)).text;
  assert.equal(cal.match(/Báo cáo sáng/g).length >= 10, true);
  // Thứ 7 không có việc (lịch tuần phía trên vẫn hiện các ngày Thứ 2–6)
  assert.match((await admin.get(`/today?date=2026-11-07&user=${minhId}`)).text, /Không có việc nào trong ngày này/);
});

test('form có mục Lặp lại: chọn sẵn thứ của ngày; lặp mà không chọn thứ -> báo lỗi', async () => {
  const form = (await admin.get('/tasks/new?date=2026-11-02')).text; // Thứ 2
  assert.match(form, /value="weekly"/);
  assert.match(form, /value="1" data-name="Thứ Hai" checked/);
  assert.match(form, /Mỗi Thứ Hai/);

  const bad = await assign(admin, { title: 'Không chọn thứ', assignee_id: lanId, repeat: 'weekly', repeat_until: addDays(today, 7) });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Chọn ít nhất một thứ để lặp lại/);
  assert.match(bad.text, /Chưa chọn thứ/);
});

test('sửa việc + chọn lặp lại -> giữ việc cũ, thêm việc cho các thứ đã chọn', async () => {
  await assign(admin, { title: 'Họp giao ban', assignee_id: lanId, date: '2026-12-07' }); // Thứ 2
  const id = await taskIdOn(admin, `/today?date=2026-12-07&user=${lanId}`, 'Họp giao ban');
  const edit = (await admin.get(`/tasks/${id}/edit`)).text;
  assert.match(edit, /name="repeat" value="none" checked/);
  assert.match(edit, /value="1" data-name="Thứ Hai" checked/);

  const res = await postForm(
    admin,
    `/tasks/${id}`,
    { title: 'Họp giao ban', assignee_id: lanId, date: '2026-12-07', status: 'done', repeat: 'weekly', repeat_days: ['1', '4'], repeat_until: '2026-12-17' },
    { from: `/tasks/${id}/edit` },
  );
  assert.equal(res.status, 302);
  // Thêm Thứ 5 10/12, Thứ 2 14/12, Thứ 5 17/12 (chưa làm); việc gốc vẫn "Đã xong"
  for (const date of ['2026-12-10', '2026-12-14', '2026-12-17']) {
    assert.match((await admin.get(`/today?date=${date}&user=${lanId}`)).text, /Họp giao ban/);
  }
  assert.match((await admin.get(`/today?date=2026-12-08&user=${lanId}`)).text, /Không có việc nào trong ngày này/);
  const cal = (await admin.get(`/calendar?month=2026-12&user=${lanId}`)).text;
  assert.equal(cal.match(/Họp giao ban/g).length >= 4, true);
});

test('quy tắc lặp lại', () => {
  const all = [0, 1, 2, 3, 4, 5, 6];
  assert.deepEqual(repeatDates('2026-11-02', 'none'), { dates: ['2026-11-02'] });
  assert.equal(repeatDates('2026-11-02', 'weekly', '2026-11-08', all).dates.length, 7);
  assert.deepEqual(repeatDates('2026-11-02', 'weekly', '2026-11-16', [1]).dates, ['2026-11-02', '2026-11-09', '2026-11-16']);
  // Ngày bắt đầu luôn là lần đầu, kể cả khi không trùng thứ đã chọn
  assert.deepEqual(repeatDates('2026-11-02', 'weekly', '2026-11-08', [3]).dates, ['2026-11-02', '2026-11-04']);
  assert.ok(repeatDates('2026-11-02', 'weekly', '2026-11-08', []).error.repeat_days);
  assert.ok(repeatDates('2026-11-02', 'weekly', undefined, all).error.repeat_until);
  assert.ok(repeatDates('2026-11-02', 'weekly', '2026-11-01', all).error.repeat_until);
  assert.ok(repeatDates('2026-01-01', 'weekly', '2026-12-31', all).error.repeat_until); // quá 3 tháng
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
