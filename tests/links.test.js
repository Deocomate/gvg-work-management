import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { previewUrl } from '../src/lib/link-preview.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Lê Mai', email: 'mai@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });

const addLink = (data) => postForm(admin, '/links', data, { from: '/links/new' });
const idOf = async (title) => {
  const row = (await admin.get('/links')).text.split('data-link-row').slice(1).find((r) => r.includes(title));
  return row.match(/\/links\/(\d+)\/edit/)[1];
};

test('chưa có link: quản lý thấy nút thêm, nhân viên chỉ thấy trang trống', async () => {
  assert.match((await admin.get('/links')).text, /href="\/links\/new"/);
  const page = await mai.get('/links');
  assert.equal(page.status, 200);
  assert.match(page.text, /Chưa có link tài liệu nào/);
  assert.doesNotMatch(page.text, /href="\/links\/new"/);
});

test('quản lý thêm link -> mọi người thấy ở trang Tài liệu (mở tab mới), không hiện ở trang Hôm nay', async () => {
  const res = await addLink({ title: 'Quy trình nghỉ phép', url: 'https://drive.google.com/abc', note: 'Đọc trước khi xin nghỉ' });
  assert.equal(res.status, 302);

  const page = (await mai.get('/links')).text;
  assert.match(page, /Quy trình nghỉ phép/);
  assert.match(page, /href="https:\/\/drive.google.com\/abc" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(page, /\/links\/\d+\/edit/);

  const home = (await mai.get('/').redirects(5)).text;
  assert.match(home, /href="\/links"/);
  assert.doesNotMatch(home, /Quy trình nghỉ phép/);
});

test('thiếu tên, link sai hoặc link "javascript:" -> báo lỗi', async () => {
  const noTitle = await addLink({ title: ' ', url: 'https://a.vn' });
  assert.equal(noTitle.status, 422);
  assert.match(noTitle.text, /Vui lòng nhập tên tài liệu/);

  for (const url of ['drive.google.com/abc', 'javascript:alert(1)', 'ftp://a.vn/x']) {
    const bad = await addLink({ title: 'Lỗi', url });
    assert.equal(bad.status, 422, url);
    assert.match(bad.text, /http:\/\/ hoặc https:\/\//);
  }
});

test('sửa và xoá link', async () => {
  const id = await idOf('Quy trình nghỉ phép');
  const edit = await postForm(admin, `/links/${id}`, { title: 'Quy trình nghỉ phép 2026', url: 'https://drive.google.com/xyz', note: '' }, { from: `/links/${id}/edit` });
  assert.equal(edit.status, 302);
  assert.match((await mai.get('/links')).text, /Quy trình nghỉ phép 2026/);

  const del = await postForm(admin, `/links/${id}/delete`, {}, { from: '/links' });
  assert.equal(del.status, 302);
  assert.doesNotMatch((await mai.get('/links')).text, /Quy trình nghỉ phép/);
});

test('nhân viên không thêm/sửa/xoá được link', async () => {
  await addLink({ title: 'Biểu mẫu', url: 'https://a.vn' });
  const id = await idOf('Biểu mẫu');
  assert.equal((await mai.get('/links/new')).status, 403);
  assert.equal((await mai.get(`/links/${id}/edit`)).status, 403);
  assert.equal((await postForm(mai, '/links', { title: 'Hack', url: 'https://x.vn' }, { from: '/links' })).status, 403);
  assert.equal((await postForm(mai, `/links/${id}`, { title: 'Hack', url: 'https://x.vn' }, { from: '/links' })).status, 403);
  assert.equal((await postForm(mai, `/links/${id}/delete`, {}, { from: '/links' })).status, 403);
  assert.match((await mai.get('/links')).text, /Biểu mẫu/);
});

test('id lạ -> 404', async () => {
  assert.equal((await admin.get('/links/99999/edit')).status, 404);
  assert.equal((await admin.get('/links/abc/edit')).status, 404);
  assert.equal((await postForm(admin, '/links/99999/delete', {}, { from: '/links' })).status, 404);
});

// ---------- Thư mục, tìm kiếm, xem trước ----------

const addFolder = (name) => postForm(admin, '/links/folders', { name }, { from: '/links/folders/new' });
const folderIdOf = async (name) => {
  const html = (await admin.get('/links')).text;
  const item = html.split('<a href="/links?folder=').find((part) => part.includes(`">${name}<`));
  return item.match(/^(\d+)/)[1];
};

test('quản lý tạo thư mục, thêm link vào thư mục -> xem theo thư mục', async () => {
  assert.equal((await addFolder('Biểu mẫu nhân sự')).status, 302);
  assert.equal((await addFolder('Quy trình')).status, 302);
  const dup = await addFolder('  biểu mẫu NHÂN SỰ ');
  assert.equal(dup.status, 422);
  assert.match(dup.text, /Đã có thư mục tên này/);
  assert.equal((await addFolder(' ')).status, 422);

  const formsId = await folderIdOf('Biểu mẫu nhân sự');
  const res = await addLink({ title: 'Đơn xin nghỉ phép', url: 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit', folder_id: formsId });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/links?folder=${formsId}`);
  await addLink({ title: 'Hướng dẫn chấm công', url: 'https://a.vn/cham-cong', note: 'Dùng máy vân tay' });

  const inFolder = (await mai.get(`/links?folder=${formsId}`)).text;
  assert.match(inFolder, /Đơn xin nghỉ phép/);
  assert.doesNotMatch(inFolder, /Hướng dẫn chấm công/);
  assert.doesNotMatch(inFolder, /Đổi tên thư mục/); // nhân viên không sửa thư mục
  assert.match((await admin.get(`/links?folder=${formsId}`)).text, /Đổi tên thư mục/);

  const unsorted = (await mai.get('/links?folder=none')).text;
  assert.match(unsorted, /Hướng dẫn chấm công/);
  assert.doesNotMatch(unsorted, /Đơn xin nghỉ phép/);

  assert.equal((await mai.get('/links?folder=99999')).status, 404);
  const bad = await addLink({ title: 'X', url: 'https://a.vn', folder_id: '99999' });
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Thư mục này không còn/);
});

test('tìm kiếm: không dấu, không phân biệt hoa thường, tìm trong mọi thư mục', async () => {
  const page = (await mai.get('/links?q=' + encodeURIComponent('NGHI PHEP'))).text;
  assert.match(page, /Đơn xin nghỉ phép/);
  assert.doesNotMatch(page, /Hướng dẫn chấm công/);
  assert.match((await mai.get('/links?q=van%20tay')).text, /Hướng dẫn chấm công/); // theo ghi chú
  assert.match((await mai.get('/links?q=bieu%20mau')).text, /Đơn xin nghỉ phép/); // theo tên thư mục
  assert.match((await mai.get('/links?q=zzzz')).text, /Không tìm thấy tài liệu nào/);
});

test('nút Xem trước chỉ hiện với link nhúng được (Google Docs…), CSP cho phép nhúng', async () => {
  const res = await mai.get('/links');
  assert.match(res.text, /data-preview="https:\/\/docs.google.com\/document\/d\/1AbCdEfGhIjKlMnOp\/preview"/);
  const row = res.text.split('data-link-row').find((r) => r.includes('Hướng dẫn chấm công'));
  assert.doesNotMatch(row, /data-preview=/);
  assert.match(res.text, /<dialog id="link-preview"/);
  assert.match(res.headers['content-security-policy'], /frame-src 'self' https:\/\/drive.google.com https:\/\/docs.google.com/);
});

test('đổi tên, xoá thư mục -> link bên trong chuyển về Chưa phân loại', async () => {
  const id = await folderIdOf('Biểu mẫu nhân sự');
  assert.equal((await postForm(admin, `/links/folders/${id}`, { name: 'quy TRÌNH' }, { from: '/links' })).status, 422); // trùng tên
  assert.equal((await postForm(admin, `/links/folders/${id}`, { name: 'Biểu mẫu' }, { from: '/links' })).status, 302);
  assert.match((await mai.get('/links')).text, /">Biểu mẫu</);

  assert.equal((await postForm(admin, `/links/folders/${id}/delete`, {}, { from: '/links' })).status, 302);
  assert.equal((await mai.get(`/links?folder=${id}`)).status, 404);
  assert.match((await mai.get('/links?folder=none')).text, /Đơn xin nghỉ phép/);
  assert.equal((await postForm(admin, '/links/folders/99999/delete', {}, { from: '/links' })).status, 404);
});

test('nhân viên không tạo/sửa/xoá được thư mục', async () => {
  const id = await folderIdOf('Quy trình');
  assert.equal((await mai.get('/links/folders/new')).status, 403);
  assert.equal((await postForm(mai, '/links/folders', { name: 'Hack' }, { from: '/links' })).status, 403);
  assert.equal((await postForm(mai, `/links/folders/${id}`, { name: 'Hack' }, { from: '/links' })).status, 403);
  assert.equal((await postForm(mai, `/links/folders/${id}/delete`, {}, { from: '/links' })).status, 403);
});

test('previewUrl: đổi link Google/YouTube thành link nhúng, link khác -> không có', () => {
  const id = '1AbCdEfGhIjKlMnOp';
  assert.equal(previewUrl(`https://drive.google.com/file/d/${id}/view?usp=sharing`), `https://drive.google.com/file/d/${id}/preview`);
  assert.equal(previewUrl(`https://drive.google.com/open?id=${id}`), `https://drive.google.com/file/d/${id}/preview`);
  assert.equal(previewUrl(`https://drive.google.com/drive/folders/${id}`), `https://drive.google.com/embeddedfolderview?id=${id}#list`);
  assert.equal(previewUrl(`https://docs.google.com/spreadsheets/u/0/d/${id}/edit#gid=0`), `https://docs.google.com/spreadsheets/d/${id}/preview`);
  assert.equal(previewUrl(`https://docs.google.com/presentation/d/${id}/edit`), `https://docs.google.com/presentation/d/${id}/preview`);
  assert.equal(previewUrl(`https://docs.google.com/forms/d/e/${id}/viewform`), `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`);
  assert.equal(previewUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(previewUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  for (const url of ['https://a.vn/x', 'https://drive.google.com/', 'https://evil.com/drive.google.com/file/d/abc', 'nope']) {
    assert.equal(previewUrl(url), null, url);
  }
});

test('thêm link kèm tạo thư mục mới ngay trong form; trùng tên thì dùng thư mục cũ', async () => {
  const form = (await admin.get('/links/new')).text;
  assert.match(form, /<option value="new"/);
  assert.match(form, /data-show-when="folder_id=new"/);

  const res = await addLink({ title: 'Mẫu hợp đồng lao động', url: 'https://a.vn/hd', folder_id: 'new', new_folder: '  Hợp   đồng ' });
  assert.equal(res.status, 302);
  const id = await folderIdOf('Hợp đồng');
  assert.equal(res.headers.location, `/links?folder=${id}`);

  await addLink({ title: 'Phụ lục hợp đồng', url: 'https://a.vn/pl', folder_id: 'new', new_folder: 'HỢP ĐỒNG' });
  const page = (await mai.get(`/links?folder=${id}`)).text;
  assert.match(page, /Mẫu hợp đồng lao động/);
  assert.match(page, /Phụ lục hợp đồng/);
  assert.doesNotMatch((await admin.get('/links')).text, />HỢP ĐỒNG</);

  // Thiếu tên thư mục mới -> báo lỗi; link sai -> không tạo thư mục thừa
  const noName = await addLink({ title: 'X', url: 'https://a.vn', folder_id: 'new', new_folder: ' ' });
  assert.equal(noName.status, 422);
  assert.match(noName.text, /Vui lòng nhập tên thư mục/);
  const badLink = await addLink({ title: 'X', url: 'sai', folder_id: 'new', new_folder: 'Thư mục thừa' });
  assert.equal(badLink.status, 422);
  assert.doesNotMatch((await admin.get('/links')).text, /Thư mục thừa</);
});

test('nút Mở / Sửa / Xoá chỉ là biểu tượng, có nhãn cho trình đọc màn hình', async () => {
  const row = (await admin.get('/links')).text.split('data-link-row').find((r) => r.includes('Phụ lục hợp đồng'));
  assert.match(row, /class="btn-ghost btn-icon" title="Mở tab mới" aria-label="Mở Phụ lục hợp đồng ở tab mới"/);
  assert.match(row, /title="Sửa" aria-label="Sửa Phụ lục hợp đồng"/);
  assert.match(row, /title="Xoá" aria-label="Xoá Phụ lục hợp đồng"/);
  assert.doesNotMatch(row, />\s*(Mở ↗|Sửa|Xoá)\s*</);
});
