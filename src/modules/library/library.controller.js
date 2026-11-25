// Thư viện ảnh (Tài liệu > Thư viện): lưới album, trang album dạng lưới ảnh, tải từng ảnh hoặc cả album (.zip).
import { once } from 'node:events';
import { isManager } from '#modules/tasks/tasks.service.js';
import { MAX_PHOTO_MB } from '#middleware/upload.js';
import { createZipWriter } from '#lib/zip.js';
import * as service from './library.service.js';

// Ảnh không bao giờ đổi nội dung theo id (sửa = xoá rồi thêm ảnh mới) nên trình duyệt giữ lâu được — lưới mở lại tức thì.
const IMAGE_CACHE = 'private, max-age=31536000, immutable';

const disposition = (kind, name) => `${kind}; filename*=UTF-8''${encodeURIComponent(name)}`;

export async function index(req, res) {
  const albums = await service.listAlbums();
  const [featured, ...rest] = albums;
  res.render('library/index', { title: 'Thư viện', albums, featured, rest, manager: isManager(req.user) });
}

export async function show(req, res) {
  const { album, photos } = await service.getAlbumWithPhotos(req.params.id);
  res.render('library/album', { title: album.name, album, photos, manager: isManager(req.user), maxPhotoMb: MAX_PHOTO_MB });
}

// ---------- Album ----------

const renderForm = (res, { album = null, values = {}, errors = {}, status = 200 }) =>
  res.status(status).render('library/form', { title: album ? 'Sửa album' : 'Tạo album', album, values, errors });

export function newForm(req, res) {
  renderForm(res, {});
}

export async function create(req, res) {
  const result = await service.createAlbum(req.body, req.user.id);
  if (!result.ok) return renderForm(res, { values: req.body, errors: result.errors, status: 422 });
  req.flash('success', `Đã tạo album "${result.data.name}". Thêm ảnh vào album ngay bên dưới.`);
  res.redirect(`/library/${result.data.id}`);
}

export async function editForm(req, res) {
  const album = await service.getAlbum(req.params.id);
  renderForm(res, { album, values: album });
}

export async function update(req, res) {
  const id = req.params.id;
  const result = await service.updateAlbum(id, req.body);
  if (!result.ok) return renderForm(res, { album: { id }, values: req.body, errors: result.errors, status: 422 });
  req.flash('success', 'Đã lưu album.');
  res.redirect(`/library/${id}`);
}

export async function destroy(req, res) {
  await service.deleteAlbum(req.params.id);
  req.flash('success', 'Đã xoá album và toàn bộ ảnh bên trong.');
  res.redirect('/library');
}

/** Tải cả album thành một file .zip, ghi dần từng ảnh ra trình duyệt. */
export async function downloadAlbum(req, res) {
  const album = await service.getAlbum(req.params.id);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': disposition('attachment', `${service.downloadName(album.name)}.zip`),
    'Cache-Control': 'private, no-store',
  });
  const zip = createZipWriter((chunk) => res.write(chunk));
  for await (const entry of service.albumZipEntries(album.id)) {
    if (res.destroyed) return; // người dùng huỷ tải giữa chừng
    if (!zip.add(entry.name, entry.data, { date: entry.date })) await once(res, 'drain');
  }
  zip.finish();
  res.end();
}

// ---------- Ảnh ----------

/** Tải lên một ảnh (trang album gửi lần lượt từng ảnh bằng JS). Gửi bằng form thường thì quay lại album. */
export async function addPhoto(req, res) {
  const albumId = req.params.id;
  const result = await service.addPhoto(albumId, req.body, req.files, req.user.id);
  if (req.accepts(['html', 'json']) === 'json') {
    return result.ok ? res.status(201).json({ id: result.data.id }) : res.status(422).json({ error: result.errors.photo });
  }
  req.flash(result.ok ? 'success' : 'error', result.ok ? 'Đã thêm ảnh.' : result.errors.photo);
  res.redirect(`/library/${albumId}`);
}

export async function destroyPhoto(req, res) {
  const albumId = await service.deletePhoto(req.params.id);
  req.flash('success', 'Đã xoá ảnh.');
  res.redirect(`/library/${albumId}`);
}

export async function setCover(req, res) {
  await service.setCover(req.params.id, req.params.photoId);
  req.flash('success', 'Đã đặt làm ảnh bìa album.');
  res.redirect(`/library/${req.params.id}`);
}

/** Ảnh gốc: xem trong trình duyệt, ?download=1 thì tải về với đúng tên file. */
export async function photoFile(req, res) {
  const file = await service.getPhotoFile(req.params.id);
  res.set({
    'Content-Type': file.file_type,
    'Content-Disposition': disposition(req.query.download ? 'attachment' : 'inline', file.file_name),
    'Cache-Control': IMAGE_CACHE,
  });
  res.send(Buffer.from(file.data));
}

export async function photoThumb(req, res) {
  const file = await service.getPhotoThumb(req.params.id);
  res.set({ 'Content-Type': file.file_type, 'Cache-Control': IMAGE_CACHE });
  res.send(Buffer.from(file.data));
}
