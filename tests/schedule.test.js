import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { addDays, monthGrid, todayISO, weekDays } from '../src/lib/dates.js';
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
  assert.match(home.text, /<h1[^>]*>Lịch làm việc<\/h1>/);
});

test('ngày chưa có việc hiện trạng thái rỗng; ngày sai định dạng quay về hôm nay', async () => {
  const empty = await hoa.get(`/today?date=${addDays(today, 30)}`);
  assert.match(empty.text, /Không có việc nào trong ngày này/);
  const bad = await hoa.get('/today?date=2026-02-31');
  assert.equal(bad.status, 200);
  assert.match(bad.text, /Lịch làm việc/);
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
  assert.match(html, /Quá hạn · 1 việc cần chú ý/);
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
  const all = (await admin.get('/today?user=all')).text;
  assert.match(all, /Việc riêng của quản lý/);
  assert.match(all, /Phụ trách: <span[^>]*>Phạm Hoa/);
});

test('quản lý mặc định thấy việc cả nhóm (khớp phiếu công việc), chọn được từng người', async () => {
  const all = (await admin.get('/today')).text;
  assert.match(all, /Việc riêng của quản lý/);
  assert.match(all, /Họp sáng/);
  assert.match(all, /<option value="all" selected>Tất cả nhân viên/);
  const mine = (await admin.get('/today?user=1')).text;
  assert.match(mine, /Việc riêng của quản lý/);
  assert.doesNotMatch(mine, /Họp sáng/);
  const ofHoa = (await admin.get(`/today?user=${hoaId}`)).text;
  assert.match(ofHoa, /Họp sáng/);
  assert.doesNotMatch(ofHoa, /Việc riêng của quản lý/);
});

test('trang Hôm nay có lịch cả tuần (T2–CN); bấm ngày khác vẫn thấy cả tuần, ngày đó được chọn', async () => {
  const html = (await hoa.get('/today')).text;
  assert.match(html, /T2[\s\S]*T3[\s\S]*T4[\s\S]*T5[\s\S]*T6[\s\S]*T7[\s\S]*CN/);
  // ô tuần: tên + giờ (+ loại việc, trạng thái); bấm ngày → chi tiết ngày bên dưới
  assert.match(html, /class="wk-task"[^>]*title="Họp sáng · 08:00/);
  assert.match(html, new RegExp(`href="/today\\?date=${today}#day-tasks"[^>]*aria-current="date"`));
  // Chọn một ngày khác trong tuần: lịch tuần vẫn hiện việc hôm nay, chi tiết là ngày được chọn
  const other = weekDays(today).find((d) => d !== today);
  const otherHtml = (await hoa.get(`/today?date=${other}`)).text;
  assert.match(otherHtml, /Họp sáng/);
  assert.match(otherHtml, new RegExp(`href="/today\\?date=${other}#day-tasks"[^>]*aria-current="date"`));
  // Nút tuần sau nhảy 7 ngày
  assert.ok(html.includes(`href="/today?date=${addDays(today, 7)}"`));
  const later = (await hoa.get(`/today?date=${addDays(today, 30)}`)).text;
  assert.doesNotMatch(later, /Họp sáng/);
});

test('phiếu công việc: ai xuất cũng ra việc của tất cả mọi người, gom theo từng người, trong một phiếu', async () => {
  assert.match((await hoa.get('/today')).text, new RegExp(`href="/today/sheet\\?date=${today}"`));
  await assign({ title: 'Đọc tài liệu', links: 'https://example.com/tai-lieu' });
  const all = (await admin.get('/today/sheet')).text;
  assert.match(all, /<a href="https:\/\/example.com\/tai-lieu" target="_blank"[^>]*>https:\/\/example.com\/tai-lieu<\/a>/);
  assert.doesNotMatch(all, /Trạng thái/);
  assert.match(all, /PHIẾU CÔNG VIỆC/);
  assert.match(all, /<h2>Phạm Hoa/);
  assert.match(all, /Họp sáng/);
  assert.match(all, /Dọn kho<\/strong> <span class="tag-high">Quan trọng/);
  assert.match(all, /Việc riêng của quản lý/);
  assert.match(all, /Tồn \d{2}\/\d{2}\/\d{4}/); // việc tồn hôm qua
  assert.match(all, /data-print/);
  assert.match(all, /data-export="png" data-export-target="#sheet"/);
  assert.match(all, /data-export="pdf" data-export-target="#sheet"/);
  assert.match(all, new RegExp(`data-filename="phieu-cong-viec-${today}"`));
  // Nhân viên xuất phiếu cũng thấy việc của cả nhóm; ?user= không lọc bớt
  const byHoa = (await hoa.get(`/today/sheet?user=${hoaId}`)).text;
  assert.match(byHoa, /Họp sáng/);
  assert.match(byHoa, /Việc riêng của quản lý/);
  assert.doesNotMatch(byHoa, /Tất cả nhân viên/);
  const empty = (await hoa.get(`/today/sheet?date=${addDays(today, 30)}`)).text;
  assert.match(empty, /Không có việc nào trong ngày này/);
});

test('phiếu tuần: việc T2–CN của mọi người, chia theo ngày; chuyển tuần trước/sau', async () => {
  const week = weekDays(today);
  const otherDay = week.find((d) => d !== today);
  await assign({ title: 'Kiểm kê cuối tuần', date: otherDay, start_time: '09:00' });
  await assign({ title: 'Việc tuần sau', date: addDays(week[6], 1) });
  assert.ok((await hoa.get('/today')).text.includes(`href="/today/sheet?date=${today}&range=week"`));
  const html = (await hoa.get(`/today/sheet?date=${today}&range=week`)).text;
  assert.match(html, /PHIẾU CÔNG VIỆC TUẦN/);
  assert.match(html, /data-export="pdf"/);
  assert.match(html, new RegExp(`data-filename="phieu-cong-viec-tuan-${week[0]}"`));
  assert.match(html, /<h2>Phạm Hoa/);
  assert.match(html, /Việc riêng của quản lý/); // nhân viên cũng thấy cả nhóm
  assert.match(html, /Kiểm kê cuối tuần/);
  assert.match(html, /Họp sáng/);
  assert.doesNotMatch(html, /Việc tuần sau/);
  // Ngày sớm hơn đứng trước
  const [first, second] = [today, otherDay].sort();
  const label = (d) => d.split('-').reverse().join('/');
  assert.ok(html.indexOf(label(first)) < html.indexOf(label(second)));
  assert.ok(html.includes(`href="/today/sheet?date=${addDays(today, 7)}&range=week"`));
  const next = (await hoa.get(`/today/sheet?date=${addDays(today, 7)}&range=week`)).text;
  assert.match(next, /Việc tuần sau/);
  const empty = (await hoa.get(`/today/sheet?date=${addDays(today, 70)}&range=week`)).text;
  assert.match(empty, /Không có việc nào trong tuần này/);
});

test('brand: gắn khi giao việc, hiện nhãn, lọc ở trang chủ (giữ khi chuyển tuần), sai brand -> lỗi', async () => {
  const day = addDays(today, 40);
  assert.match((await admin.get('/tasks/new')).text, /name="brand" value="GSXD"/);
  await assign({ title: 'Chụp ảnh gạch GSXD', date: day, brand: 'GSXD' });
  await assign({ title: 'Đóng gói Klayy', date: day, brand: 'Klayy' });
  await assign({ title: 'Việc không brand', date: day });
  const bad = await assign({ title: 'Brand lạ', date: day, brand: 'ABC' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Brand không hợp lệ/);

  const all = (await hoa.get(`/today?date=${day}`)).text;
  assert.match(all, /Chụp ảnh gạch GSXD<\/h3>\s*<span class="badge-brand-gs">GSXD<\/span>/);
  assert.match(all, /Đóng gói Klayy/);
  assert.match(all, /Việc không brand/);
  assert.match(all, /<select name="brand"[^>]*>/);

  const gs = (await hoa.get(`/today?date=${day}&brand=GSXD`)).text;
  assert.match(gs, /Chụp ảnh gạch GSXD/);
  assert.doesNotMatch(gs, /Đóng gói Klayy|Việc không brand/);
  assert.match(gs, /<option value="GSXD" selected>/);
  assert.match(gs, new RegExp(`href="/today\\?date=${addDays(day, 7)}[^"]*brand(=|&#x3D;)GSXD"`)); // giữ brand khi sang tuần
  assert.match(gs, /\/tasks\/new\?date=[^"]*&brand=GSXD/); // Thêm việc chọn sẵn brand

  const none = (await hoa.get(`/today?date=${day}&brand=none`)).text;
  assert.match(none, /Việc không brand/);
  assert.doesNotMatch(none, /Chụp ảnh gạch GSXD|Đóng gói Klayy/);
  // Brand lạ trên URL -> bỏ lọc
  assert.match((await hoa.get(`/today?date=${day}&brand=xyz`)).text, /Đóng gói Klayy/);
  // Form "Thêm việc" từ trang đang lọc -> chọn sẵn brand
  assert.match((await admin.get(`/tasks/new?date=${day}&brand=Klayy`)).text, /name="brand" value="Klayy" checked/);
  // Phiếu in ghi brand
  assert.match((await hoa.get(`/today/sheet?date=${day}`)).text, /Chụp ảnh gạch GSXD<\/strong> <span class="tag-brand">GSXD/);
});

test('tuần luôn bắt đầu Thứ 2', () => {
  assert.deepEqual(weekDays('2026-10-28'), [
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
  ]);
  assert.equal(weekDays('2026-11-01')[0], '2026-10-26'); // Chủ nhật thuộc tuần trước đó
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
