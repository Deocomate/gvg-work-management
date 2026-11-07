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
  assert.match(page.text, /Plan tuần/);
  assert.match(page.text, /Lịch tháng/);
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
  assert.match(page, /Mới/);
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

  const badUrl = await add(mai, { title: 'X', post_url: 'javascript:alert(1)' });
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

test('lưu đủ các cột như Sheet: brand, loại video, người góp, kịch bản, khung giờ, địa điểm, CSVC, ghi chú', async () => {
  const maiId = (await admin.get('/plan/new')).text.match(/<option value="(\d+)"[^>]*>Lê Mai</)[1];
  const res = await add(nam, {
    title: 'Mở lò vẽ vàng',
    brand: 'Vũ Gia',
    video_type: 'B – Trung bình',
    topic: 'VG – Xưởng & nghệ nhân',
    reference_url: 'Lò vàng Vạn An Lộc', // Sheet hay ghi chữ thay vì link
    writer_id: maiId,
    script: 'https://docs.google.com/document/d/abc',
    note: 'Hook: ném nhẫn vàng vào bát',
  });
  assert.equal(res.status, 302);
  const page = (await nam.get('/plan?brand=Vũ%20Gia')).text;
  assert.match(page, /Mở lò vẽ vàng/);
  assert.match(page, /B – Trung bình/);
  assert.match(page, /💡 Trần Nam/); // không chọn người góp -> là người nhập
  assert.match(page, /✍ Lê Mai/);
  assert.match(page, /🔗 Lò vàng Vạn An Lộc/);
  assert.match(page, /href="https:\/\/docs.google.com\/document\/d\/abc"/);
  assert.match(page, /Hook: ném nhẫn vàng/);
  assert.doesNotMatch((await nam.get('/plan?brand=GSXD')).text, /Mở lò vẽ vàng/);
  assert.match((await nam.get('/plan?q=nhan+vang')).text, /Mở lò vẽ vàng/); // tìm cả trong ghi chú

  // Chữ "javascript:" ở ô link-hoặc-chữ không bao giờ thành link bấm được
  await add(nam, { title: 'Link độc', reference_url: 'javascript:alert(1)' });
  assert.doesNotMatch((await nam.get('/plan?q=link+doc')).text, /href="javascript:/);

  // Brand / loại video lạ -> báo lỗi
  const bad = await add(nam, { title: 'X', brand: 'Hãng khác', video_type: 'Z' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Brand không hợp lệ/);
});

test('Plan tuần: đánh số tuần như Sheet, cảnh báo chưa có ngày quay / quay sát ngày / trùng giờ quay', async () => {
  // Tuần thuộc tháng chứa ngày Thứ 5: 26/10–01/11/2026 là Tuần 5 tháng 10, 02/11 là Tuần 1 tháng 11
  const nov = (await mai.get('/plan/weeks?month=2026-11')).text;
  assert.match(nov, /Tuần 1 \(tháng 11\)[\s\S]*02\/11 – 08\/11\/2026/);
  assert.doesNotMatch(nov, /26\/10 – 01\/11/);
  assert.match((await mai.get('/plan/weeks?month=2026-10')).text, /Tuần 5 \(tháng 10\)[\s\S]*26\/10 – 01\/11\/2026/);

  const namId = (await admin.get('/plan/new')).text.match(/<option value="(\d+)"[^>]*>Trần Nam</)[1];
  const base = { platform: 'tiktok', owner_id: namId, shoot_time: '15h00 - 15h30' };
  await add(admin, { ...base, title: 'Quay ở xưởng', shoot_date: '2026-11-03', post_date: '2026-11-04', location: 'Xưởng' });
  await add(admin, { ...base, title: 'Quay ở số 18', shoot_date: '2026-11-03', post_date: '2026-11-10', location: '18' });
  await add(admin, { title: 'Chưa quay gì', post_date: '2026-11-06', post_time: '19:00' });

  const posts = (await mai.get('/plan/weeks?month=2026-11')).text;
  assert.match(posts, /Quay ở xưởng/);
  assert.match(posts, /Chưa quay gì/);
  assert.match(posts, /chưa có ngày quay/);
  assert.match(posts, /trùng giờ quay/);
  // Bảng xếp theo ngày đăng
  assert.ok(posts.indexOf('Quay ở xưởng') < posts.indexOf('Chưa quay gì'));
  assert.ok(posts.indexOf('Chưa quay gì') < posts.indexOf('Quay ở số 18'));

  const shoot = (await mai.get('/plan/weeks?month=2026-11&by=shoot')).text;
  assert.match(shoot, /⚠ 15h00 - 15h30/); // Nam bị xếp 2 nơi cùng giờ
  assert.match(shoot.split('data-plan-week')[1], /Quay ở xưởng/);
  assert.doesNotMatch(shoot.split('data-plan-unshot')[0], /Chưa quay gì/); // không có ngày quay -> không nằm trong bảng quay
  // Tham số lạ không làm lỗi
  assert.equal((await mai.get('/plan/weeks?month=abc&by=xyz')).status, 200);
});

test('nhập từ Google Sheet cũ: chỉ quản lý, khớp tên nhân viên, bấm lại không trùng', async () => {
  assert.doesNotMatch((await mai.get('/plan/weeks')).text, /Nhập từ Sheet/);
  assert.equal((await postForm(mai, '/plan/import-sheet', {}, { from: '/plan/weeks' })).status, 403);

  const first = await postForm(admin, '/plan/import-sheet', {}, { from: '/plan/weeks' });
  assert.equal(first.status, 302);
  const flash = (await admin.get('/plan/weeks')).text;
  assert.match(flash, /Đã nhập \d+ nội dung từ Google Sheet/);
  assert.match(flash, /Chưa có tài khoản: .*Nhài/);

  const oct = (await admin.get('/plan/weeks?month=2026-10')).text;
  assert.match(oct, /Video men lam/);
  assert.match(oct, /Giới thiệu xưởng[\s\S]*?Đã quay/);
  const ideas = (await admin.get('/plan?status=all&q=mo+lo+ve+vang')).text;
  assert.match(ideas, /Lê Mai/); // "Mai" trong Sheet khớp tài khoản Lê Mai

  const total = (await admin.get('/plan?status=all')).text.split('data-plan-row').length;
  await postForm(admin, '/plan/import-sheet', {}, { from: '/plan/weeks' });
  assert.match((await admin.get('/plan/weeks')).text, /Đã nhập 0 nội dung/);
  assert.equal((await admin.get('/plan?status=all')).text.split('data-plan-row').length, total);
});
