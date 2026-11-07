import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { todayISO, addDays, weekDays } from '../src/lib/dates.js';
import { parseTimeRange } from '../src/modules/plan/plan.sync.js';

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
const userId = async (name) => (await admin.get('/plan/new')).text.match(new RegExp(`<option value="(\\d+)"[^>]*>${name}<`))[1];
/** Thẻ của một nội dung trên bảng Idea bank (cột nào, có link sửa không). */
const cardOf = async (agent, title, query = '') => {
  const page = (await agent.get(`/plan?dropped=1${query}`)).text;
  const cols = page.split('data-plan-col="').slice(1);
  for (const col of cols) {
    const card = col.split('data-plan-row').slice(1).find((c) => c.includes(title));
    if (card) return { column: col.slice(0, col.indexOf('"')), html: card, id: card.match(/\/plan\/(\d+)\//)?.[1] };
  }
  return null;
};
const idOf = async (title) => (await cardOf(admin, title)).id;
const today = todayISO();

test('menu có tab Plan; Idea bank trống thì có hướng dẫn; 3 tab: Idea bank, Lịch đăng, Lịch quay', async () => {
  const page = await mai.get('/plan');
  assert.equal(page.status, 200);
  assert.match(page.text, /href="\/plan"/);
  assert.match(page.text, /Kho ý tưởng đang trống/);
  assert.match(page.text, /💡 Idea bank/);
  assert.match(page.text, /📤 Lịch đăng/);
  assert.match(page.text, /🎬 Lịch quay/);
});

test('chưa đăng nhập -> về trang đăng nhập', async () => {
  const { agent } = await setup();
  const res = await agent.get('/plan');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/login/);
});

test('thêm ý tưởng không ngày -> nằm ở cột "Mới"; tìm không dấu, lọc brand/tuyến', async () => {
  const res = await add(mai, { title: 'Hậu trường nung gốm', brand: 'Vũ Gia', topic: 'VG – Xưởng & nghệ nhân', description: 'Hook: lò 1200 độ' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/plan');

  const card = await cardOf(nam, 'Hậu trường nung gốm');
  assert.equal(card.column, 'idea');
  assert.match(card.html, /Vũ Gia/);
  assert.match((await nam.get('/plan?q=hau+truong+nung')).text, /Hậu trường nung gốm/);
  assert.doesNotMatch((await nam.get('/plan?q=khong+co')).text, /Hậu trường nung gốm/);
  assert.match((await nam.get('/plan?topic=VG%20–%20Xưởng%20%26%20nghệ%20nhân')).text, /Hậu trường nung gốm/);
  assert.doesNotMatch((await nam.get('/plan?brand=GSXD')).text, /Hậu trường nung gốm/);
});

test('thiếu tên, link sai, ngày đăng trước ngày quay -> báo lỗi, giữ dữ liệu, mở đúng phần', async () => {
  const noTitle = await add(mai, { title: ' ', description: 'Giữ lại nội dung này' });
  assert.equal(noTitle.status, 422);
  assert.match(noTitle.text, /Vui lòng nhập tên ý tưởng/);
  assert.match(noTitle.text, /Giữ lại nội dung này/);

  const badUrl = await add(mai, { title: 'X', post_url: 'javascript:alert(1)' });
  assert.equal(badUrl.status, 422);
  assert.match(badUrl.text, /http:\/\/ hoặc https:\/\//);
  assert.match(badUrl.text, /<details class="plan-fold" open>\s*<summary>📤 Đăng bài/); // phần có lỗi tự mở

  const badDates = await add(mai, { title: 'X', shoot_date: addDays(today, 3), post_date: today });
  assert.equal(badDates.status, 422);
  assert.match(badDates.text, /Ngày đăng phải sau hoặc cùng ngày quay/);

  const bad = await add(mai, { title: 'X', brand: 'Hãng khác' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Brand không hợp lệ/);
});

test('form gọn: ý tưởng mới chỉ mở phần chính; bấm + ở một ngày -> mở sẵn phần Đăng bài', async () => {
  const blank = (await mai.get('/plan/new')).text;
  assert.doesNotMatch(blank, /plan-fold" open/);
  const day = addDays(today, 2);
  const page = (await mai.get(`/plan/new?post_date=${day}`)).text;
  assert.match(page, new RegExp(`name="post_date" type="date" value="${day}"`));
  assert.match(page, /<details class="plan-fold" open>\s*<summary>📤 Đăng bài/);
});

test('nút bước tiếp theo: Mới → Đã chọn → Đã viết kịch bản; gắn ngày -> Đã lên lịch', async () => {
  const id = await idOf('Hậu trường nung gốm');
  await postForm(mai, `/plan/${id}/status`, { status: 'selected', back: '/plan' }, { from: '/plan' });
  assert.equal((await cardOf(mai, 'Hậu trường nung gốm')).column, 'selected');
  assert.match((await cardOf(mai, 'Hậu trường nung gốm')).html, /✍ Xong kịch bản/);
  await postForm(mai, `/plan/${id}/status`, { status: 'scripted', back: '/plan' }, { from: '/plan' });
  assert.match((await cardOf(mai, 'Hậu trường nung gốm')).html, /📅 Lên lịch/);

  const edit = await postForm(mai, `/plan/${id}`, { title: 'Hậu trường nung gốm', status: 'scripted', post_date: today }, { from: `/plan/${id}/edit` });
  assert.equal(edit.status, 302);
  assert.equal(edit.headers.location, `/plan/weeks?kind=post&week=${today}`);
  assert.equal((await cardOf(mai, 'Hậu trường nung gốm')).column, 'scheduled');

  const bad = await postForm(mai, `/plan/${id}/status`, { status: 'hack' }, { from: '/plan' });
  assert.equal(bad.status, 302);
});

test('Lịch đăng và Lịch quay tách riêng, mỗi brand một hàng; đặt tên tuần như Sheet; cảnh báo', async () => {
  // Tuần thuộc tháng chứa ngày Thứ 5
  assert.match((await mai.get('/plan/weeks?week=2026-11-04')).text, /Tuần 1 \(tháng 11\)[\s\S]*02\/11 – 08\/11\/2026/);
  assert.match((await mai.get('/plan/weeks?week=2026-10-28')).text, /Tuần 5 \(tháng 10\)[\s\S]*26\/10 – 01\/11\/2026/);
  assert.equal((await mai.get('/plan/weeks?week=abc&kind=xyz&brand=zzz')).status, 200);

  const namId = await userId('Trần Nam');
  const base = { owner_id: namId, shoot_time: '15h00 - 15h30' };
  await add(admin, { ...base, title: 'Quay ở xưởng', brand: 'GSXD', shoot_date: '2026-12-01', post_date: '2026-12-02', location: 'Xưởng' });
  await add(admin, { ...base, title: 'Quay ở số 18', brand: 'Klayy', shoot_date: '2026-12-01', post_date: '2026-12-10', location: '18' });
  await add(admin, { title: 'Chưa quay gì', brand: 'Vũ Gia', post_date: '2026-12-03', post_time: '19:00' });

  // Lịch đăng: chỉ bài đăng, theo hàng brand
  const posts = (await mai.get('/plan/weeks?kind=post&week=2026-12-01')).text;
  const lane = (html, brand) => html.split(`data-plan-brand="${brand}"`)[1].split('data-plan-brand=')[0];
  assert.match(lane(posts, 'Vũ Gia').split('data-plan-day="2026-12-03"')[1], /19:00[\s\S]*Chưa quay gì/);
  assert.match(lane(posts, 'GSXD'), /Quay ở xưởng/);
  assert.doesNotMatch(lane(posts, 'GSXD'), /Chưa quay gì/);
  assert.doesNotMatch(posts, /Quay 15:00/); // không lẫn buổi quay
  assert.match(posts, /chưa có ngày quay/);
  assert.doesNotMatch(posts, /Quay ở số 18/); // đăng 10/12, tuần sau

  // Lịch quay: chỉ buổi quay, có giờ + địa điểm, cảnh báo trùng giờ, danh sách cần chốt ngày quay
  const shoots = (await mai.get('/plan/weeks?kind=shoot&week=2026-12-01')).text;
  assert.match(lane(shoots, 'GSXD'), /15:00–15:30[\s\S]*Quay ở xưởng[\s\S]*📍 Xưởng/);
  assert.match(lane(shoots, 'Klayy'), /Quay ở số 18/);
  assert.match(shoots, /⚠/); // Nam bị xếp 2 nơi cùng giờ
  assert.match(shoots, /trùng giờ quay/);
  assert.doesNotMatch(shoots.split('data-plan-unshot')[0], /Chưa quay gì/);
  assert.match(shoots.split('data-plan-unshot')[1], /Chưa quay gì/);

  // Lọc 1 brand
  const onlyKlayy = (await mai.get('/plan/weeks?kind=shoot&brand=Klayy&week=2026-12-01')).text;
  assert.match(onlyKlayy, /Quay ở số 18/);
  assert.doesNotMatch(onlyKlayy, /Quay ở xưởng/);
  // + ở hàng brand -> form chọn sẵn brand và ngày quay
  assert.match(onlyKlayy, /\/plan\/new\?shoot_date=2026-12-01&amp;brand=Klayy|\/plan\/new\?shoot_date=2026-12-01&brand=Klayy/);
  const prefilled = (await mai.get('/plan/new?shoot_date=2026-12-01&brand=Klayy')).text;
  assert.match(prefilled, /<option value="Klayy" selected>/);

  // Tháng: cũng tách đăng / quay và lọc brand
  const monthPosts = (await mai.get('/plan/calendar?kind=post&month=2026-12')).text;
  assert.match(monthPosts, /Chưa quay gì/);
  assert.match(monthPosts.split('data-plan-day="2026-12-01"')[1].split('data-plan-day=')[0], /^((?!Quay ở xưởng)[\s\S])*$/);
  assert.match((await mai.get('/plan/calendar?kind=shoot&month=2026-12')).text, /Quay ở xưởng/);
  assert.doesNotMatch((await mai.get('/plan/calendar?kind=shoot&month=2026-12&brand=Klayy')).text, /Quay ở xưởng/);
});

test('đồng bộ sang lịch làm việc: người phụ trách có việc Quay + Đăng; đổi ở Plan thì lịch đổi theo', async () => {
  const namId = await userId('Trần Nam');
  const maiId = await userId('Lê Mai');
  const res = await add(admin, {
    title: 'Mở lò vẽ vàng', owner_id: namId, shoot_date: '2026-12-14', shoot_time: '9h30 - 11h', location: 'Xưởng',
    props: 'Đèn, chân máy', post_date: '2026-12-16', post_time: '20:00', script: 'https://docs.google.com/document/d/abc',
  });
  assert.equal(res.status, 302);

  const shootDay = (await nam.get('/today?date=2026-12-14')).text;
  assert.match(shootDay, /🎬 Quay: Mở lò vẽ vàng/);
  assert.match(shootDay, /09:30[\s\S]*11:00/);
  assert.match(shootDay, /📍 Địa điểm: Xưởng/);
  assert.match(shootDay, /Đèn, chân máy/);
  assert.match(shootDay, /docs\.google\.com\/document\/d\/abc/);
  assert.match(shootDay, />Plan</);
  assert.match(shootDay, /Xem ở Plan/);
  assert.match((await nam.get('/today?date=2026-12-16')).text, /📤 Đăng: Mở lò vẽ vàng[\s\S]*20:00|20:00[\s\S]*📤 Đăng: Mở lò vẽ vàng/);

  // Không sửa/xoá trực tiếp trên lịch — chuyển sang Plan
  const taskId = shootDay.match(/\/tasks\/(\d+)\/status/)[1];
  const editLink = await admin.get(`/tasks/${taskId}/edit`);
  assert.equal(editLink.status, 302);
  assert.match(editLink.headers.location, /^\/plan\/\d+\/edit$/);
  assert.equal((await postForm(admin, `/tasks/${taskId}/delete`, {}, { from: '/today' })).status, 403);

  // Đổi ngày quay + giao cho Mai -> việc chuyển ngày, chuyển người
  const id = await idOf('Mở lò vẽ vàng');
  await postForm(admin, `/plan/${id}`, { title: 'Mở lò vẽ vàng', owner_id: maiId, shoot_date: '2026-12-15', post_date: '2026-12-16', status: 'scheduled' }, { from: `/plan/${id}/edit` });
  assert.doesNotMatch((await nam.get('/today?date=2026-12-14')).text, /Mở lò vẽ vàng/);
  assert.match((await mai.get('/today?date=2026-12-15')).text, /🎬 Quay: Mở lò vẽ vàng/);
  assert.doesNotMatch((await mai.get('/today?date=2026-12-15')).text, /09:30/); // bỏ khung giờ -> cả ngày

  // Bỏ ngày quay -> việc quay biến mất, việc đăng còn
  await postForm(admin, `/plan/${id}`, { title: 'Mở lò vẽ vàng', owner_id: maiId, post_date: '2026-12-16', status: 'scheduled' }, { from: `/plan/${id}/edit` });
  assert.doesNotMatch((await mai.get('/today?date=2026-12-15')).text, /🎬 Quay: Mở lò vẽ vàng/);
  assert.match((await mai.get('/today?date=2026-12-16')).text, /📤 Đăng: Mở lò vẽ vàng/);
});

test('đồng bộ 2 chiều: tick xong việc trên lịch -> Plan đổi bước; Bỏ / xoá ở Plan -> việc biến mất', async () => {
  const namId = await userId('Trần Nam');
  await add(admin, { title: 'Bình hút lộc', owner_id: namId, shoot_date: '2026-12-21', post_date: '2026-12-23' });
  const id = await idOf('Bình hút lộc');
  // id việc trong danh sách của ngày (bỏ qua dải 7 ngày phía trên)
  const taskOf = async (date) =>
    (await nam.get(`/today?date=${date}`)).text.match(/<h3[^>]*>[^<]*Bình hút lộc<\/h3>[\s\S]*?\/tasks\/(\d+)\/status/)[1];

  await postForm(nam, `/tasks/${await taskOf('2026-12-21')}/status`, { status: 'done' }, { from: '/today' });
  assert.equal((await cardOf(admin, 'Bình hút lộc')).column, 'filmed');

  await postForm(nam, `/tasks/${await taskOf('2026-12-23')}/status`, { status: 'done' }, { from: '/today' });
  assert.equal((await cardOf(admin, 'Bình hút lộc')).column, 'posted');

  // Mở lại việc đăng -> Plan lùi về Đã quay
  await postForm(nam, `/tasks/${await taskOf('2026-12-23')}/status`, { status: 'todo' }, { from: '/today' });
  assert.equal((await cardOf(admin, 'Bình hút lộc')).column, 'filmed');

  // Đổi trạng thái ở Plan -> việc trên lịch xong theo
  await postForm(admin, `/plan/${id}/status`, { status: 'posted' }, { from: '/plan' });
  assert.match((await nam.get('/today?date=2026-12-23')).text, /📤 Đăng: Bình hút lộc[\s\S]*?Mở lại/);

  await postForm(admin, `/plan/${id}/status`, { status: 'dropped' }, { from: '/plan' });
  assert.doesNotMatch((await nam.get('/today?date=2026-12-21')).text, /Bình hút lộc/);
  assert.equal((await cardOf(admin, 'Bình hút lộc')).column, 'dropped');

  await postForm(admin, `/plan/${id}/status`, { status: 'scheduled' }, { from: '/plan' });
  assert.match((await nam.get('/today?date=2026-12-21')).text, /Bình hút lộc/);
  await postForm(admin, `/plan/${id}/delete`, {}, { from: '/plan' });
  assert.doesNotMatch((await nam.get('/today?date=2026-12-21')).text, /Bình hút lộc/);
});

test('đọc khung giờ quay gõ tự do', () => {
  assert.deepEqual(parseTimeRange('15h00 - 15h30'), { start: '15:00', end: '15:30' });
  assert.deepEqual(parseTimeRange('9h - 11h'), { start: '09:00', end: '11:00' });
  assert.deepEqual(parseTimeRange('13:00-15:00'), { start: '13:00', end: '15:00' });
  assert.deepEqual(parseTimeRange('9h30'), { start: '09:30', end: null });
  assert.deepEqual(parseTimeRange('sáng'), { start: null, end: null });
  assert.deepEqual(parseTimeRange('25h'), { start: null, end: null });
});

test('quyền: người khác không sửa/xoá được; người phụ trách sửa được, không xoá được', async () => {
  await add(mai, { title: 'Ý tưởng của Mai' });
  const id = await idOf('Ý tưởng của Mai');
  assert.ok(!(await cardOf(nam, 'Ý tưởng của Mai')).id); // Nam không thấy link sửa
  assert.equal((await nam.get(`/plan/${id}/edit`)).status, 403);
  assert.equal((await postForm(nam, `/plan/${id}`, { title: 'Hack' }, { from: '/plan' })).status, 403);
  assert.equal((await postForm(nam, `/plan/${id}/status`, { status: 'dropped' }, { from: '/plan' })).status, 403);
  assert.equal((await postForm(nam, `/plan/${id}/delete`, {}, { from: '/plan' })).status, 403);

  const namId = await userId('Trần Nam');
  await postForm(admin, `/plan/${id}`, { title: 'Ý tưởng của Mai', owner_id: namId }, { from: `/plan/${id}/edit` });
  assert.equal((await nam.get(`/plan/${id}/edit`)).status, 200);
  assert.doesNotMatch((await nam.get(`/plan/${id}/edit`)).text, /Xoá nội dung này/);
  assert.equal((await postForm(nam, `/plan/${id}`, { title: 'Ý tưởng của Mai (bản Nam)' }, { from: '/plan' })).status, 302);
  assert.equal((await postForm(nam, `/plan/${id}/delete`, {}, { from: '/plan' })).status, 403);

  // Người tạo xoá được; id lạ -> 404
  assert.equal((await postForm(mai, `/plan/${id}/delete`, {}, { from: '/plan' })).status, 302);
  assert.equal(await cardOf(admin, 'bản Nam'), null);
  assert.equal((await admin.get('/plan/99999/edit')).status, 404);
  assert.equal((await admin.get('/plan/abc/edit')).status, 404);
});

test('link quay lại không cho trỏ ra ngoài app; chữ "javascript:" không thành link', async () => {
  const res = await add(mai, { title: 'Ý tưởng an toàn', back: 'https://evil.example', reference_url: 'javascript:alert(1)' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/plan');
  assert.doesNotMatch((await mai.get('/plan')).text, /href="javascript:/);
});

test('nhập từ Google Sheet cũ: chỉ quản lý, khớp tên, lên lịch làm việc, bấm lại không trùng', async () => {
  assert.doesNotMatch((await mai.get('/plan')).text, /Nhập từ Sheet/);
  assert.equal((await postForm(mai, '/plan/import-sheet', {}, { from: '/plan' })).status, 403);

  // "Nhài" trong Sheet -> tạo tài khoản trước để việc quay vào lịch của chị
  await postForm(admin, '/staff', { name: 'Phạm Nhài', email: 'nhai@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
  const { agent: nhai } = await setup();
  await loginAs(nhai, { email: 'nhai@test.local', password: 'mat-khau-123' });

  assert.equal((await postForm(admin, '/plan/import-sheet', {}, { from: '/plan' })).status, 302);
  const flash = (await admin.get('/plan')).text;
  assert.match(flash, /Đã nhập \d+ nội dung từ Google Sheet/);
  assert.match(flash, /Chưa có tài khoản: .*Long/);

  assert.match((await admin.get(`/plan/weeks?week=2026-10-26`)).text, /Video men lam/);
  assert.equal((await cardOf(admin, 'Giới thiệu xưởng')).column, 'filmed');
  assert.match((await cardOf(admin, 'Mở lò vẽ vàng', '&brand=Vũ%20Gia')).html, /✍ Lê Mai/);
  assert.match((await nhai.get('/today?date=2026-10-26')).text, /🎬 Quay: Video men lam[\s\S]*15:00/);

  const count = (await admin.get('/plan?dropped=1')).text.split('data-plan-row').length;
  await postForm(admin, '/plan/import-sheet', {}, { from: '/plan' });
  assert.match((await admin.get('/plan')).text, /Đã nhập 0 nội dung/);
  assert.equal((await admin.get('/plan?dropped=1')).text.split('data-plan-row').length, count);
});

test('lịch tuần mặc định là tuần này', async () => {
  const page = (await mai.get('/plan/weeks')).text;
  assert.match(page, new RegExp(`data-plan-day="${weekDays(today)[0]}"`));
});

test('form thêm ý tưởng có sẵn ô Link tham khảo ở phần chính (không phải mở thêm)', async () => {
  const page = (await mai.get('/plan/new')).text;
  const main = page.split('<details')[0];
  assert.match(main, /name="reference_url"/);
  assert.match(main, /Link tham khảo/);
});

test('lịch tuần: brand không có nội dung thì ẩn hẳn; tuần trống báo một dòng; không báo quá ngày đăng', async () => {
  const shoots = (await mai.get('/plan/weeks?kind=shoot&week=2026-12-01')).text;
  assert.match(shoots, /data-plan-brand="GSXD"/);
  assert.doesNotMatch(shoots, /data-plan-brand="Vũ Gia"/); // Vũ Gia chỉ có bài đăng, không có buổi quay tuần này
  assert.doesNotMatch(shoots, /Chưa có nội dung trong tuần này/);

  const empty = (await mai.get('/plan/weeks?kind=shoot&week=2030-01-07')).text;
  assert.doesNotMatch(empty, /data-plan-brand=/);
  assert.match(empty, /Tuần này chưa có buổi quay nào/);

  await add(admin, { title: 'Bài đăng hôm qua', brand: 'Vũ Gia', post_date: addDays(today, -1) });
  const posts = (await mai.get(`/plan/weeks?kind=post&week=${addDays(today, -1)}`)).text;
  assert.match(posts, /Bài đăng hôm qua/);
  assert.doesNotMatch(posts, /quá ngày đăng|⏰/i);
});
