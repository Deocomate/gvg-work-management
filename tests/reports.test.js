// Báo cáo tuần marketing: quyền, số tự động (nội dung, khách hàng), nhập tay, xuất Excel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { addDays, todayISO, weekDays } from '../src/lib/dates.js';
import { contentStats, socialRows } from '../src/modules/reports/reports.service.js';
import { delta } from '../src/modules/reports/reports.controller.js';

const today = todayISO();
const monday = weekDays(today)[0];
const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Ngô Vy', email: 'vy-rp@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const { agent: vy } = await setup();
await loginAs(vy, { email: 'vy-rp@test.local', password: 'mat-khau-123' });

// Đọc một file trong .xlsx (zip) — đủ để kiểm tra nội dung chữ.
function unzipEntry(buf, name) {
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const fname = buf.toString('utf8', i + 30, i + 30 + nameLen);
    const start = i + 30 + nameLen + extra;
    if (fname === name) {
      const data = buf.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
  }
  return null;
}

test('chỉ quản lý xem được báo cáo tuần; nhân viên bị chặn và không thấy menu', async () => {
  assert.equal((await vy.get('/reports')).status, 403);
  assert.equal((await vy.get('/reports/export.xlsx')).status, 403);
  assert.doesNotMatch((await vy.get('/today')).text, /href="\/reports"/);
  const { agent: guest } = await setup();
  assert.equal((await guest.get('/reports')).status, 302);

  const page = await admin.get('/reports');
  assert.equal(page.status, 200);
  assert.match(page.text, /Báo cáo tuần marketing/);
  assert.match(page.text, /data-export="pdf"/);
  assert.match(page.text, /data-export="png"/);
  assert.match((await admin.get('/today')).text, /href="\/reports"/);
});

test('tự đếm video đăng/quay trong tuần theo brand và khách mới', async () => {
  await postForm(admin, '/plan', { title: 'Video bình hoa', brand: 'Vũ Gia', status: 'selected', post_date: monday, shoot_date: monday }, { from: '/plan/new' });
  await postForm(admin, '/customers', { name: 'Khách Báo Cáo', phone: '0911222333', source: 'tiktok', customer_type: 'personal' }, { from: '/customers/new' });

  const page = (await admin.get(`/reports?date=${monday}`)).text;
  assert.match(page, /Video bình hoa/);
  assert.match(page, /badge-brand-vg[^>]*>Vũ Gia/);
  assert.match(page, /Chưa đăng/);
  // Khách mới theo nguồn
  assert.match(page, /TikTok<\/span><span[^>]*>1</);
});

test('nhập chỉ số kênh + nhận xét, sai số thì báo lỗi, lưu xong hiện trên báo cáo', async () => {
  const bad = await postForm(admin, '/reports', { date: monday, s_0_tiktok_followers: 'abc' }, { from: '/reports/edit' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Phải là số/);

  // Tuần trước 1.000 follower -> tuần này 1.250 = tăng 250
  const prevMonday = addDays(monday, -7);
  await postForm(admin, '/reports', { date: prevMonday, s_0_tiktok_followers: '1000', s_0_tiktok_views: '5000' }, { from: '/reports/edit' });
  const ok = await postForm(
    admin,
    '/reports',
    { date: monday, s_0_tiktok_followers: '1.250', s_0_tiktok_views: '10000', highlights: 'Video bình hoa lên xu hướng', next_plan: 'Quay thêm 3 video' },
    { from: '/reports/edit' },
  );
  assert.equal(ok.status, 302);

  const page = (await admin.get(`/reports?date=${monday}`)).text;
  assert.match(page, /Video bình hoa lên xu hướng/);
  assert.match(page, /Quay thêm 3 video/);
  assert.match(page, /\+250/);
  assert.match(page, /▲ 100%/); // lượt xem 5.000 -> 10.000

  // Form mở lại có sẵn số đã nhập
  assert.match((await admin.get(`/reports/edit?date=${monday}`)).text, /name="s_0_tiktok_followers" value="1250"/);
});

test('xuất Excel có đủ trang và đủ số liệu', async () => {
  const res = await admin.get(`/reports/export.xlsx?date=${monday}`).buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-disposition'], new RegExp(`bao-cao-tuan-${monday}\\.xlsx`));
  const workbook = unzipEntry(res.body, 'xl/workbook.xml');
  for (const name of ['Tổng quan', 'Nội dung', 'Kênh MXH', 'Nhận xét', 'Kế hoạch']) assert.match(workbook, new RegExp(name));
  assert.match(unzipEntry(res.body, 'xl/worksheets/sheet2.xml'), /Video bình hoa/);
  assert.match(unzipEntry(res.body, 'xl/worksheets/sheet3.xml'), /<v>1250<\/v>/);
  assert.match(unzipEntry(res.body, 'xl/worksheets/sheet4.xml'), /Video bình hoa lên xu hướng/);
  assert.match(unzipEntry(res.body, 'xl/worksheets/sheet5.xml'), /Quay thêm 3 video/); // ghi chú kế hoạch
});

test('contentStats: bỏ bài Bỏ, đếm đã quay theo việc quay / đã đăng', () => {
  const week = { from: '2026-11-23', to: '2026-11-29' };
  const s = contentStats(
    [
      { id: 1, title: 'A', brand: 'Klayy', status: 'posted', post_date: '2026-11-24', shoot_date: '2026-11-23' },
      { id: 2, title: 'B', brand: 'Klayy', status: 'selected', post_date: '2026-11-25', shoot_date: '2026-11-24', shoot_task_status: 'done' },
      { id: 3, title: 'C', brand: 'Klayy', status: 'dropped', post_date: '2026-11-25' },
      { id: 4, title: 'D', brand: null, status: 'selected', post_date: '2026-12-02', shoot_date: '2026-11-26' },
    ],
    week,
  );
  assert.deepEqual(s.total, { planned: 2, posted: 1, shootPlanned: 3, shot: 2 });
  assert.equal(s.byBrand.find((b) => b.brand === 'Chưa chọn brand').shootPlanned, 1);
  assert.equal(s.posts.length, 2);
});

test('socialRows + delta: tính tăng follower và so với tuần trước', () => {
  const rows = socialRows(
    [{ brand: 'Vũ Gia', channel: 'facebook', followers: 900, views: null, engagements: 30 }],
    [{ brand: 'Vũ Gia', channel: 'facebook', followers: 1000, views: 10, engagements: 20 }],
  );
  assert.equal(rows[0].followerGain, -100);
  assert.deepEqual(delta(30, 20), { text: '▲ 50%', tone: 'up' });
  assert.deepEqual(delta(5, 10, { lowerIsBetter: true }), { text: '▼ 50%', tone: 'up' });
  assert.equal(delta(10, 5, { neutral: true }).tone, 'same');
  assert.equal(delta(3, 0).text, '▲ từ 0');
  assert.equal(delta(null, 3).tone, 'none');
});

test('kế hoạch tuần tới: thêm nhiều dòng, bỏ dòng trống, báo lỗi thiếu tên việc, tuần sau tick xong', async () => {
  const week1 = addDays(monday, -14);
  const week2 = addDays(monday, -7);

  // Dòng có mục tiêu mà thiếu tên việc -> lỗi, giữ nguyên dữ liệu đã nhập
  const bad = await postForm(admin, '/reports', { date: week1, plan_id: ['', ''], plan_title: ['', 'Chạy quảng cáo Klayy'], plan_target: ['50k view', ''], plan_owner_id: ['', ''], plan_brand: ['', 'Klayy'], plan_due_date: ['', ''] }, { from: '/reports/edit' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Nhập việc cần làm/);
  assert.match(bad.text, /value="Chạy quảng cáo Klayy"/);

  const ok = await postForm(
    admin,
    '/reports',
    {
      date: week1,
      plan_id: ['', '', ''],
      plan_title: ['Quay 3 video Klayy', '', 'Chạy quảng cáo Klayy'],
      plan_target: ['3 video', '', ''],
      plan_owner_id: ['', '', ''],
      plan_brand: ['Klayy', '', 'Klayy'],
      plan_due_date: [addDays(week1, 9), '', ''],
    },
    { from: '/reports/edit' },
  );
  assert.equal(ok.status, 302);
  const page1 = (await admin.get(`/reports?date=${week1}`)).text;
  assert.match(page1, /Kế hoạch tuần tới/);
  assert.match(page1, /Quay 3 video Klayy/);
  assert.match(page1, /Chạy quảng cáo Klayy/);

  // Báo cáo tuần sau hiện lại kế hoạch để tick xong
  const form2 = (await admin.get(`/reports/edit?date=${week2}`)).text;
  const ids = [...form2.matchAll(/name="prev_plan_done" value="(\d+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  await postForm(admin, '/reports', { date: week2, prev_plan_shown: '1', prev_plan_done: ids[0] }, { from: '/reports/edit' });
  const page2 = (await admin.get(`/reports?date=${week2}`)).text;
  assert.match(page2, /xong 1\/2/);

  // Sửa kế hoạch tuần 1: bỏ một dòng, dòng còn lại giữ trạng thái Xong
  const form1 = (await admin.get(`/reports/edit?date=${week1}`)).text;
  const keepId = form1.match(/name="plan_id" value="(\d+)"/)[1];
  await postForm(admin, '/reports', { date: week1, plan_id: keepId, plan_title: 'Quay 3 video Klayy (sửa)', plan_target: '', plan_owner_id: '', plan_brand: '', plan_due_date: '' }, { from: '/reports/edit' });
  const after = (await admin.get(`/reports?date=${week2}`)).text;
  assert.match(after, /Quay 3 video Klayy \(sửa\)/);
  assert.doesNotMatch(after, /Chạy quảng cáo Klayy/);
  assert.match(after, /xong 1\/1/);

  // Excel có trang Kế hoạch
  const res = await admin.get(`/reports/export.xlsx?date=${week1}`).buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.match(unzipEntry(res.body, 'xl/workbook.xml'), /Kế hoạch/);
  assert.match(unzipEntry(res.body, 'xl/worksheets/sheet5.xml'), /Quay 3 video Klayy \(sửa\)/);
});

test('kế hoạch tự lấy từ Lịch làm việc, gộp việc lặp lại, tự đánh dấu Xong theo lịch', async () => {
  const week = addDays(monday, 28);
  const next = addDays(week, 7);
  const vyId = Number((await admin.get('/staff')).text.split('<tr>').slice(1).find((r) => r.includes('Ngô Vy')).match(/\/staff\/(\d+)\/edit/)[1]);
  for (const date of [addDays(next, 1), addDays(next, 3)]) {
    await postForm(admin, '/tasks', { title: 'Chụp ảnh sản phẩm Klayy', assignee_id: vyId, date, repeat: 'none', brand: 'Klayy' }, { from: '/tasks/new' });
  }

  await admin.get('/today'); // đọc hết thông báo 'Đã thêm việc…' còn chờ
  // Chưa lưu: báo cáo và form điền sẵn từ lịch, 2 ngày gộp một dòng
  const report = (await admin.get(`/reports?date=${week}`)).text;
  assert.match(report, /Lấy từ Lịch làm việc tuần tới/);
  assert.equal(report.split('Chụp ảnh sản phẩm Klayy').length - 1, 1);
  const form = (await admin.get(`/reports/edit?date=${week}`)).text;
  const taskIds = form.match(/name="plan_task_ids" value="([\d,]+)"/)[1];
  assert.equal(taskIds.split(',').length, 2);
  assert.match(form, /value="2 ngày"/);

  await postForm(admin, '/reports', { date: week, plan_id: '', plan_task_ids: taskIds, plan_title: 'Chụp ảnh sản phẩm Klayy', plan_target: '20 ảnh', plan_owner_id: String(vyId), plan_brand: 'Klayy', plan_due_date: addDays(next, 3) }, { from: '/reports/edit' });

  // Tuần sau: chưa xong -> xong 1/2 ngày -> Xong khi cả 2 việc xong
  assert.match((await admin.get(`/reports?date=${next}`)).text, /xong 0\/1/);
  const ids = taskIds.split(',');
  await postForm(admin, `/tasks/${ids[0]}/status`, { status: 'done' }, { from: '/today' });
  assert.match((await admin.get(`/reports?date=${next}`)).text, /Chưa xong<\/span> <span[^>]*>1\/2/);
  await postForm(admin, `/tasks/${ids[1]}/status`, { status: 'done' }, { from: '/today' });
  assert.match((await admin.get(`/reports?date=${next}`)).text, /xong 1\/1/);
  // Form tuần sau: dòng từ lịch không tick tay được
  assert.match((await admin.get(`/reports/edit?date=${next}`)).text, /disabled aria-label="Tự theo Lịch làm việc"/);

  // "Lấy thêm từ Lịch làm việc": việc mới giao thêm được thêm vào, việc đã có không lặp lại
  await postForm(admin, '/tasks', { title: 'Viết caption', assignee_id: vyId, date: addDays(next, 2), repeat: 'none' }, { from: '/tasks/new' });
  const added = (await admin.get(`/reports/edit?date=${week}&add=calendar`)).text;
  assert.match(added, /Đã thêm 1 việc từ Lịch làm việc/);
  assert.match(added, /value="Viết caption"/);
  assert.equal(added.split('value="Chụp ảnh sản phẩm Klayy"').length - 1, 1);
});
