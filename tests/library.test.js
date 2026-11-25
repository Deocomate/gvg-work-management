import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, postForm, csrfToken } from './helpers.js';
import { loginAs, loginAsAdmin } from './auth-helpers.js';
import { crc32 } from '../src/lib/zip.js';

const { agent: admin } = await setup();
await loginAsAdmin(admin);
await postForm(admin, '/staff', { name: 'Lê Mai', email: 'mai@test.local', role: 'member', password: 'mat-khau-123' }, { from: '/staff/new' });
const { agent: mai } = await setup();
await loginAs(mai, { email: 'mai@test.local', password: 'mat-khau-123' });

// "Ảnh" giả: chỉ cần đúng vài byte đầu (máy chủ nhận diện loại ảnh theo nội dung, không theo tên file).
const jpeg = (fill) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, fill)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(50, 7)]);
const PHOTO_A = jpeg(1);
const PHOTO_B = jpeg(2);

const createAlbum = (data) => postForm(admin, '/library', data, { from: '/library/new' });
const albumIdFrom = (res) => Number(res.headers.location.match(/^\/library\/(\d+)$/)[1]);

async function uploadPhoto(agent, albumId, { buffer, name, thumb, width, height }) {
  const token = await csrfToken(agent, '/library');
  let req = agent.post(`/library/${albumId}/photos`).set('Accept', 'application/json').set('x-csrf-token', token);
  if (width) req = req.field('width', String(width)).field('height', String(height));
  if (buffer) req = req.attach('photo', buffer, name);
  if (thumb) req = req.attach('thumb', thumb, 'thumb.webp');
  return req;
}

/** Đọc file zip kiểu "store" (không nén) -> [{ name, data, crcOk }]. */
function readZip(buf) {
  const entries = [];
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const crc = buf.readUInt32LE(at + 14);
    const size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString('utf8');
    const data = buf.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    entries.push({ name, data, crcOk: crc32(data) === crc });
    at += 30 + nameLen + size;
  }
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, 'thiếu phần mục lục cuối file zip');
  return entries;
}

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

let albumId;

test('Tài liệu chia 2 tab Link + Thư viện; thư viện trống: quản lý thấy nút tạo, nhân viên không', async () => {
  for (const path of ['/links', '/library']) {
    const page = (await mai.get(path)).text;
    assert.match(page, /aria-label="Mục Tài liệu"/, path);
    assert.match(page, /href="\/links"[^>]*>Link</, path);
    assert.match(page, /href="\/library"[^>]*>Thư viện</, path);
  }
  // Menu chính "Tài liệu" vẫn sáng khi đang ở Thư viện
  assert.match((await mai.get('/library')).text, /href="\/links" class="nav-link nav-link-active"/);

  assert.match((await admin.get('/library')).text, /href="\/library\/new"/);
  const page = await mai.get('/library');
  assert.match(page.text, /Chưa có album ảnh nào/);
  assert.doesNotMatch(page.text, /href="\/library\/new"/);
});

test('tạo album: thiếu tên / trùng tên (kể cả khác hoa thường có dấu) bị báo lỗi; nhân viên không tạo được', async () => {
  const res = await createAlbum({ name: '  Sản phẩm   Vũ Gia ' });
  assert.equal(res.status, 302);
  albumId = albumIdFrom(res);

  const blank = await createAlbum({ name: ' ' });
  assert.equal(blank.status, 422);
  assert.match(blank.text, /Vui lòng nhập tên album/);

  const dup = await createAlbum({ name: 'SẢN PHẨM VŨ GIA' });
  assert.equal(dup.status, 422);
  assert.match(dup.text, /Đã có album tên này/);

  const byMember = await postForm(mai, '/library', { name: 'Album lạ' }, { from: '/library' });
  assert.equal(byMember.status, 403);

  const page = (await mai.get('/library')).text;
  assert.match(page, /Sản phẩm Vũ Gia/);
});

test('tải ảnh lên: nhận ảnh thật, từ chối file không phải ảnh, nhân viên không tải lên được', async () => {
  const a = await uploadPhoto(admin, albumId, { buffer: PHOTO_A, name: 'bình gốm.jpg', thumb: webp, width: 4000, height: 3000 });
  assert.equal(a.status, 201, a.text);
  // Cùng tên file -> vẫn nhận (trong zip sẽ đổi thành "bình gốm (2).jpg")
  const b = await uploadPhoto(admin, albumId, { buffer: PHOTO_B, name: 'bình gốm.jpg' });
  assert.equal(b.status, 201);

  const fake = await uploadPhoto(admin, albumId, { buffer: Buffer.from('%PDF-1.4 không phải ảnh'), name: 'anh.jpg' });
  assert.equal(fake.status, 422);
  assert.match(fake.body.error, /Chỉ nhận ảnh/);

  const none = await uploadPhoto(admin, albumId, {});
  assert.equal(none.status, 422);

  const byMember = await uploadPhoto(mai, albumId, { buffer: PHOTO_A, name: 'x.jpg' });
  assert.equal(byMember.status, 403);

  const missing = await uploadPhoto(admin, 9999, { buffer: PHOTO_A, name: 'x.jpg' });
  assert.equal(missing.status, 404);
});

test('trang album: lưới ảnh có nút tải từng ảnh + tải cả album; nhân viên không thấy khung tải lên', async () => {
  const page = (await mai.get(`/library/${albumId}`)).text;
  const ids = [...page.matchAll(/data-lib-photo data-id="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(ids.length, 2);
  assert.match(page, new RegExp(`href="/library/photos/${ids[0]}/file\\?download=1" download="bình gốm.jpg"`));
  assert.match(page, new RegExp(`href="/library/${albumId}/download"`));
  assert.match(page, /lib-tile-feature/); // ảnh đầu là ô lớn
  assert.doesNotMatch(page, /data-lib-upload/);
  assert.doesNotMatch(page, /data-viewer-delete/);

  const adminPage = (await admin.get(`/library/${albumId}`)).text;
  assert.match(adminPage, /data-lib-upload/);
  assert.match(adminPage, /data-viewer-delete/);
});

test('tải ảnh gốc đúng tên file; ảnh thu nhỏ dùng bản nhỏ, ảnh không có bản nhỏ thì dùng ảnh gốc', async () => {
  const page = (await mai.get(`/library/${albumId}`)).text;
  const [first, second] = [...page.matchAll(/data-lib-photo data-id="(\d+)"/g)].map((m) => m[1]);

  const file = await mai.get(`/library/photos/${first}/file?download=1`).buffer(true).parse(binary);
  assert.equal(file.status, 200);
  assert.equal(file.headers['content-type'], 'image/jpeg');
  assert.equal(file.headers['content-disposition'], "attachment; filename*=UTF-8''b%C3%ACnh%20g%E1%BB%91m.jpg");
  assert.ok(file.body.equals(PHOTO_A));

  const thumb = await mai.get(`/library/photos/${first}/thumb`).buffer(true).parse(binary);
  assert.equal(thumb.headers['content-type'], 'image/webp');
  assert.ok(thumb.body.equals(webp));

  const fallback = await mai.get(`/library/photos/${second}/thumb`).buffer(true).parse(binary);
  assert.equal(fallback.headers['content-type'], 'image/jpeg');
  assert.ok(fallback.body.equals(PHOTO_B));

  assert.equal((await mai.get('/library/photos/9999/file')).status, 404);
  assert.equal((await mai.get('/library/abc')).status, 404);
});

test('tải cả album: một file zip đủ ảnh gốc, tên file trùng được đánh số', async () => {
  const res = await mai.get(`/library/${albumId}/download`).buffer(true).parse(binary);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/zip');
  assert.equal(res.headers['content-disposition'], "attachment; filename*=UTF-8''S%E1%BA%A3n%20ph%E1%BA%A9m%20V%C5%A9%20Gia.zip");
  const entries = readZip(res.body);
  assert.deepEqual(entries.map((e) => e.name), ['bình gốm.jpg', 'bình gốm (2).jpg']);
  assert.ok(entries[0].data.equals(PHOTO_A));
  assert.ok(entries[1].data.equals(PHOTO_B));
  assert.ok(entries.every((e) => e.crcOk));
});

test('đặt ảnh bìa, xoá ảnh, sửa và xoá album', async () => {
  const page = (await admin.get(`/library/${albumId}`)).text;
  const [first, second] = [...page.matchAll(/data-lib-photo data-id="(\d+)"/g)].map((m) => m[1]);

  // Chưa chọn bìa -> bìa là ảnh đầu tiên
  assert.match((await mai.get('/library')).text, new RegExp(`/library/photos/${first}/thumb`));
  const cover = await postForm(admin, `/library/${albumId}/cover/${second}`, {}, { from: `/library/${albumId}` });
  assert.equal(cover.status, 302);
  assert.match((await mai.get('/library')).text, new RegExp(`/library/photos/${second}/thumb`));
  assert.equal((await postForm(admin, `/library/${albumId}/cover/9999`, {}, { from: `/library/${albumId}` })).status, 404);
  assert.equal((await postForm(mai, `/library/${albumId}/cover/${first}`, {}, { from: `/library/${albumId}` })).status, 403);

  // Xoá ảnh bìa -> bìa quay về ảnh đầu tiên còn lại
  const del = await postForm(admin, `/library/photos/${second}/delete`, {}, { from: `/library/${albumId}` });
  assert.equal(del.status, 302);
  assert.equal(del.headers.location, `/library/${albumId}`);
  assert.match((await mai.get('/library')).text, new RegExp(`/library/photos/${first}/thumb`));
  assert.equal((await mai.get(`/library/photos/${second}/file`)).status, 404);

  const edit = await postForm(admin, `/library/${albumId}`, { name: 'Sản phẩm 2026' }, { from: `/library/${albumId}/edit` });
  assert.equal(edit.status, 302);
  assert.match((await mai.get(`/library/${albumId}`)).text, /Sản phẩm 2026/);

  const remove = await postForm(admin, `/library/${albumId}/delete`, {}, { from: `/library/${albumId}` });
  assert.equal(remove.status, 302);
  assert.equal((await mai.get(`/library/${albumId}`)).status, 404);
  assert.equal((await mai.get(`/library/photos/${first}/file`)).status, 404); // ảnh bị xoá theo album
});
