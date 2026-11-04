import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm, csrfToken } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);

// Trang: vai trò Sale (được dùng Data khách hàng). Mai: nhân viên thường.
await postForm(admin, '/staff', { name: 'Trang', email: 'trang@test.local', role: 'sale', password: 'mat-khau-123' }, { from: '/staff/new' });
await postForm(admin, '/staff', { name: 'Lê Mai', email: 'mai@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const { agent: trang } = await setup();
await loginAs(trang, { email: 'trang@test.local', password: 'mat-khau-123' });
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });

const add = (agent, data) => postForm(agent, '/customers', data, { from: '/customers/new' });
const idOf = async (name) => {
  const row = (await admin.get('/customers')).text.split('<tr>').slice(1).find((r) => r.includes(name));
  return row.match(/\/customers\/(\d+)\/edit/)[1];
};

test('menu Data khách hàng: quản lý và Trang thấy, nhân viên thường không thấy và bị chặn', async () => {
  assert.match((await admin.get('/links')).text, /href="\/customers"/);
  assert.match((await trang.get('/links')).text, /href="\/customers"/);
  assert.doesNotMatch((await mai.get('/links')).text, /href="\/customers"/);

  assert.equal((await mai.get('/customers')).status, 403);
  assert.equal((await mai.get('/customers/new')).status, 403);
  assert.equal((await postForm(mai, '/customers', { name: 'Hack', phone: '0900000000' }, { from: '/links' })).status, 403);
});

test('chưa đăng nhập -> chuyển tới trang đăng nhập', async () => {
  const { agent } = await setup();
  const res = await agent.get('/customers');
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/login/);
});

test('Trang nhập khách hàng đầy đủ -> hiện trong danh sách, ghi người nhập', async () => {
  const res = await add(trang, {
    customer_type: 'business',
    name: 'Chị Thu Hà',
    phone: '0912 345 678',
    email: 'Ha@Example.com',
    zalo: '0912345678',
    facebook: 'facebook.com/thuha.nguyen',
    tiktok: '@thuha_decor',
    social: 'Instagram @thuha',
    company: 'Công ty ABC',
    tax_code: '0101234567',
    address: '12 Láng Hạ, Hà Nội',
    birthday: '1990-05-20',
    source: 'facebook',
    status: 'consulting',
    interest: 'Quà Tết 50 bộ',
    note: 'Gọi sau 17h',
  });
  assert.equal(res.status, 302);

  const page = (await admin.get('/customers')).text;
  assert.match(page, /Chị Thu Hà/);
  assert.match(page, /Công ty ABC/);
  assert.match(page, /href="tel:0912 345 678"/);
  assert.match(page, /ha@example.com/);
  assert.match(page, /Đang tư vấn/);
  assert.match(page, /Facebook/);
  assert.match(page, /Trang/); // người nhập + người phụ trách mặc định

  const id = await idOf('Chị Thu Hà');
  const edit = (await trang.get(`/customers/${id}/edit`)).text;
  assert.match(edit, /value="0101234567"/);
  assert.match(edit, /value="1990-05-20"/);
  // Lưu riêng từng kênh: Zalo, Facebook, TikTok, kênh khác
  assert.match(edit, /name="zalo" type="text" value="0912345678"/);
  assert.match(edit, /name="facebook" type="text" value="facebook.com\/thuha.nguyen"/);
  assert.match(edit, /name="tiktok" type="text" value="@thuha_decor"/);
  assert.match(edit, /name="social" type="text" value="Instagram @thuha"/);
  assert.match(page, /TikTok<\/span> @thuha_decor/);

  // Tìm theo Facebook / TikTok
  assert.match((await trang.get('/customers?q=thuha.nguyen')).text, /Chị Thu Hà/);
  assert.match((await trang.get('/customers?q=thuha_decor')).text, /Chị Thu Hà/);
});

test('chỉ có TikTok (không SĐT, email) vẫn lưu được', async () => {
  const res = await add(trang, { name: 'Bạn chỉ có TikTok', tiktok: '@ban_tiktok' });
  assert.equal(res.status, 302);
  const id = await idOf('Bạn chỉ có TikTok');
  await postForm(admin, `/customers/${id}/delete`, {}, { from: '/customers' });
});

test('thiếu tên, không có cách liên lạc, dữ liệu sai -> báo lỗi', async () => {
  const noName = await add(trang, { name: ' ', phone: '0987654321' });
  assert.equal(noName.status, 422);
  assert.match(noName.text, /Vui lòng nhập tên khách hàng/);

  const noContact = await add(trang, { name: 'Anh Nam' });
  assert.equal(noContact.status, 422);
  assert.match(noContact.text, /Cần ít nhất một cách liên lạc/);

  const bad = await add(trang, { name: 'Anh Nam', phone: '123', email: 'abc', status: 'xyz', birthday: '2020-13-40' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /9–15 chữ số/);
  assert.match(bad.text, /Email không hợp lệ/);
  assert.match(bad.text, /Trạng thái không hợp lệ/);
  assert.match(bad.text, /Ngày sinh không hợp lệ/);
  assert.match(bad.text, /value="Anh Nam"/); // giữ lại dữ liệu đã nhập
});

test('không cho nhập trùng số điện thoại (kể cả viết khác: chấm, +84)', async () => {
  for (const phone of ['0912.345.678', '+84 912 345 678']) {
    const dup = await add(trang, { name: 'Trùng', phone });
    assert.equal(dup.status, 422, phone);
    assert.match(dup.text, /Số này đã có trong data: Chị Thu Hà/);
  }
});

test('hai người nhập cùng một số cùng lúc -> chỉ lưu một', async () => {
  const results = await Promise.all([
    add(trang, { name: 'Song song A', phone: '0977000111' }),
    add(admin, { name: 'Song song B', phone: '0977 000 111' }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [302, 422]);
  // Chỉ đếm trong bảng: nếu admin là người lưu được, thông báo "Đã thêm khách hàng Song song B" cũng hiện trên trang.
  const rows = (await admin.get('/customers?q=0977000111')).text.split('<tbody>')[1] ?? '';
  assert.equal((rows.match(/Song song/g) ?? []).length, 1);
});

test('tìm theo tên, số điện thoại; lọc theo trạng thái, nguồn', async () => {
  await add(admin, { name: 'Anh Minh', phone: '0933111222', source: 'tiktok', status: 'bought' });

  assert.match((await trang.get('/customers?q=minh')).text, /Anh Minh/);
  const byPhone = (await trang.get('/customers?q=111 222')).text;
  assert.match(byPhone, /Anh Minh/);
  assert.doesNotMatch(byPhone, /Chị Thu Hà/);

  const bought = (await trang.get('/customers?status=bought')).text;
  assert.match(bought, /Anh Minh/);
  assert.doesNotMatch(bought, /Chị Thu Hà/);

  const fb = (await trang.get('/customers?source=facebook')).text;
  assert.match(fb, /Chị Thu Hà/);
  assert.doesNotMatch(fb, /Anh Minh/);

  const none = await trang.get('/customers?q=khongcoai');
  assert.match(none.text, /Không tìm thấy khách hàng phù hợp/);

  // Ký tự đặc biệt trong ô tìm không gây lỗi
  assert.equal((await trang.get('/customers?q=%25_%27')).status, 200);
});

test('sửa và xoá khách hàng; sửa giữ được số cũ của chính mình', async () => {
  const id = await idOf('Anh Minh');
  const edit = await postForm(trang, `/customers/${id}`, { name: 'Anh Minh (VIP)', phone: '0933111222', status: 'loyal' }, { from: `/customers/${id}/edit` });
  assert.equal(edit.status, 302);
  const page = (await admin.get('/customers')).text;
  assert.match(page, /Anh Minh \(VIP\)/);
  assert.match(page, /Khách quen/);

  const del = await postForm(trang, `/customers/${id}/delete`, {}, { from: '/customers' });
  assert.equal(del.status, 302);
  assert.doesNotMatch((await admin.get('/customers')).text, /Anh Minh/);
});

// ---- Hoá đơn (form có file: multipart) ----
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

async function postMultipart(agent, path, data, { from, file } = {}) {
  const _csrf = await csrfToken(agent, from);
  let req = agent.post(path).field('_csrf', _csrf);
  for (const [k, v] of Object.entries(data)) req = req.field(k, v);
  if (file) req = req.attach('invoice_file', file.buffer, file.name);
  return req;
}

test('thêm khách kèm hoá đơn (giá trị + file PDF) -> có trong danh sách, mở được file', async () => {
  const res = await postMultipart(trang, '/customers', { name: 'Chị Hoa', phone: '0901222333', interest: 'Bình hoa', invoice_amount: '1.500.000', invoice_date: '2026-11-01', invoice_note: 'Đã chuyển khoản' }, { from: '/customers/new', file: { buffer: PDF, name: 'hoá đơn 01.pdf' } });
  assert.equal(res.status, 302);

  const list = (await admin.get('/customers?q=Chị Hoa')).text;
  assert.match(list, /1\.500\.000 đ/);
  assert.match(list, /1 hoá đơn/);
  assert.match((await admin.get('/customers?q=bình hoa')).text, /Chị Hoa/); // tìm theo mặt hàng
  // Bấm ô Hoá đơn ở danh sách là tải file về
  const downloadUrl = list.match(/href="(\/customers\/\d+\/invoices\/\d+\/file\?download=1)" download/)[1];
  const download = await admin.get(downloadUrl).buffer(true);
  assert.match(download.headers['content-disposition'], /^attachment; filename\*=UTF-8''ho%C3%A1%20%C4%91%C6%A1n%2001\.pdf$/);
  assert.ok(Buffer.from(download.body).equals(PDF));

  const id = await idOf('Chị Hoa');
  const edit = (await trang.get(`/customers/${id}/edit`)).text;
  assert.match(edit, /Mặt hàng quan tâm/);
  assert.match(edit, /01\/11\/2026/);
  assert.match(edit, /Đã chuyển khoản/);
  const fileUrl = edit.match(/href="(\/customers\/\d+\/invoices\/\d+\/file)"/)[1];
  assert.match(edit, /hoá đơn 01\.pdf/);

  const file = await trang.get(fileUrl).buffer(true);
  assert.equal(file.status, 200);
  assert.equal(file.headers['content-type'], 'application/pdf');
  assert.match(file.headers['content-disposition'], /^inline; filename\*=UTF-8''ho%C3%A1%20%C4%91%C6%A1n%2001\.pdf$/);
  assert.ok(Buffer.from(file.body).equals(PDF));

  // Người không có quyền không mở được file
  assert.equal((await mai.get(fileUrl)).status, 403);
});

test('sửa khách: thêm hoá đơn thứ hai (chỉ file ảnh), tổng cộng dồn; để trống thì không thêm', async () => {
  const id = await idOf('Chị Hoa');
  const add = await postMultipart(trang, `/customers/${id}`, { name: 'Chị Hoa', phone: '0901222333', invoice_amount: '500000', invoice_date: '2026-11-03' }, { from: `/customers/${id}/edit`, file: { buffer: PNG, name: 'anh.png' } });
  assert.equal(add.status, 302);
  assert.equal(add.headers.location, `/customers/${id}/edit`);

  const plain = await postMultipart(trang, `/customers/${id}`, { name: 'Chị Hoa', phone: '0901222333', invoice_date: '2026-11-04' }, { from: `/customers/${id}/edit` });
  assert.equal(plain.status, 302);
  assert.equal(plain.headers.location, '/customers');

  const list = (await admin.get('/customers?q=Chị Hoa')).text;
  assert.match(list, /2\.000\.000 đ/);
  assert.match(list, /2 hoá đơn/);
  // Hai file -> danh sách chọn từng hoá đơn để tải
  assert.equal(list.match(/\/file\?download=1" download/g).length, 2);
  assert.match(list, /03\/11\/2026 · 500\.000 đ/);
});

test('bấm tên khách -> thẻ chi tiết: tên, SĐT, địa chỉ, trạng thái, từng hoá đơn và tổng tiền', async () => {
  const id = await idOf('Chị Hoa');
  assert.match((await admin.get('/customers?q=Chị Hoa')).text, new RegExp(`href="/customers/${id}" data-customer-card`));

  // Popup: chỉ khung thẻ, không layout
  const modal = await trang.get(`/customers/${id}?modal=1`);
  assert.equal(modal.status, 200);
  assert.doesNotMatch(modal.text, /<html/);
  assert.match(modal.text, /Chị Hoa/);
  assert.match(modal.text, /0901222333/);
  assert.match(modal.text, /Hoá đơn \(2\)/);
  assert.match(modal.text, /01\/11\/2026[\s\S]*Đã chuyển khoản[\s\S]*1\.500\.000 đ/);
  assert.match(modal.text, /500\.000 đ/);
  assert.match(modal.text, /Tổng cộng[\s\S]*2\.000\.000 đ/);
  assert.match(modal.text, /data-card-export="png"/);
  assert.match(modal.text, /data-card-export="pdf"/);
  assert.match(modal.text, /data-filename="khach-hang-chi-hoa"/);

  // Mở link trực tiếp: trang đầy đủ có nạp script xuất file
  const page = await trang.get(`/customers/${id}`);
  assert.match(page.text, /<html/);
  assert.match(page.text, /\/vendor\/html-to-image\.js/);
  assert.equal((await trang.get('/vendor/html-to-image.js')).status, 200);

  assert.equal((await mai.get(`/customers/${id}?modal=1`)).status, 403);
  assert.equal((await admin.get('/customers/99999')).status, 404);
});

test('hoá đơn sai: file không phải PDF/ảnh, giá trị chữ, chỉ có ghi chú -> báo lỗi, không lưu gì', async () => {
  const exe = await postMultipart(trang, '/customers', { name: 'Khách lỗi', phone: '0901999888' }, { from: '/customers/new', file: { buffer: Buffer.from('MZ fake program content here'), name: 'hoadon.pdf' } });
  assert.equal(exe.status, 422);
  assert.match(exe.text, /Chỉ nhận file PDF hoặc ảnh/);
  assert.match(exe.text, /hãy chọn lại/);

  const word = await postMultipart(trang, '/customers', { name: 'Khách lỗi', phone: '0901999888', invoice_amount: 'một triệu' }, { from: '/customers/new' });
  assert.equal(word.status, 422);
  assert.match(word.text, /Giá trị hoá đơn chỉ gồm chữ số/);

  const noteOnly = await postMultipart(trang, '/customers', { name: 'Khách lỗi', phone: '0901999888', invoice_note: 'abc' }, { from: '/customers/new' });
  assert.equal(noteOnly.status, 422);
  assert.match(noteOnly.text, /Nhập giá trị hoặc đính kèm file hoá đơn/);

  assert.doesNotMatch((await admin.get('/customers')).text, /Khách lỗi/);
});

test('xoá hoá đơn; xoá khách thì hoá đơn đi theo', async () => {
  const id = await idOf('Chị Hoa');
  const edit = (await admin.get(`/customers/${id}/edit`)).text;
  const delUrl = edit.match(/action="(\/customers\/\d+\/invoices\/\d+\/delete)"/)[1];
  assert.equal((await postForm(admin, delUrl, {}, { from: `/customers/${id}/edit` })).status, 302);
  assert.match((await admin.get('/customers?q=Chị Hoa')).text, /1 hoá đơn/);
  assert.equal((await postForm(admin, delUrl, {}, { from: `/customers/${id}/edit` })).status, 404);

  const fileUrl = (await admin.get(`/customers/${id}/edit`)).text.match(/href="(\/customers\/\d+\/invoices\/\d+\/file)"/)[1];
  await postForm(admin, `/customers/${id}/delete`, {}, { from: '/customers' });
  assert.equal((await admin.get(fileUrl)).status, 404);
});

test('chưa đăng nhập gửi form có file -> bị chặn', async () => {
  const { agent } = await setup();
  const res = await agent.post('/customers').field('name', 'x').attach('invoice_file', PDF, 'a.pdf');
  assert.equal(res.status, 403);
});

test('id lạ -> 404', async () => {
  assert.equal((await admin.get('/customers/99999/edit')).status, 404);
  assert.equal((await admin.get('/customers/abc/edit')).status, 404);
  assert.equal((await postForm(admin, '/customers/99999/delete', {}, { from: '/customers' })).status, 404);
});

test('vai trò Sale: hiện trong danh sách nhân viên; quản lý đổi Trang về Nhân viên -> không vào được nữa', async () => {
  const staff = (await admin.get('/staff')).text;
  const trangRow = staff.split('<tr>').slice(1).find((r) => r.includes('trang@test.local'));
  const trangId = trangRow.match(/\/staff\/(\d+)\/edit/)[1];
  assert.match(trangRow, />Sale</);
  assert.match((await admin.get(`/staff/${trangId}/edit`)).text, /name="role" value="sale" checked/);
  // Sale vẫn là nhân viên: không vào được trang quản lý
  assert.equal((await trang.get('/staff')).status, 403);
  assert.equal((await trang.get('/performance')).status, 403);

  await postForm(admin, `/staff/${trangId}`, { name: 'Trang', email: 'trang@test.local', role: 'member' }, { from: `/staff/${trangId}/edit` });
  assert.equal((await trang.get('/customers')).status, 403);
  assert.doesNotMatch((await trang.get('/links')).text, /href="\/customers"/);

  await postForm(admin, `/staff/${trangId}`, { name: 'Trang', email: 'trang@test.local', role: 'sale' }, { from: `/staff/${trangId}/edit` });
  assert.equal((await trang.get('/customers')).status, 200);
});

test('vai trò lạ -> báo lỗi, không lưu', async () => {
  const res = await postForm(admin, '/staff', { name: 'Lạ', email: 'la@test.local', role: 'boss', password: 'mat-khau-123' }, { from: '/staff/new' });
  assert.equal(res.status, 422);
  assert.match(res.text, /Vai trò không hợp lệ/);
});
