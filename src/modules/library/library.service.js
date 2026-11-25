// Nghiệp vụ Thư viện ảnh: ai đăng nhập cũng xem/tải được, chỉ quản lý tạo album, thêm/xoá ảnh (chặn ở library.routes.js).
import { notFound } from '#lib/errors.js';
import { validate } from '#lib/validate.js';
import { detectFileType, safeFileName } from '#lib/file-types.js';
import { appWallClock } from '#lib/dates.js';
import { albumSchema, photoMetaSchema, photoNameSchema, PHOTO_TYPES, THUMB_TYPES, MAX_THUMB_BYTES } from './library.schema.js';
import * as repo from './library.repo.js';

/** Tên gọn khoảng trắng + khoá so trùng (chữ thường, giữ dấu): "  Sự kiện   T11 " -> "sự kiện t11". */
function albumData({ name }) {
  const clean = name.normalize('NFC').replace(/\s+/g, ' ');
  return { name: clean, name_key: clean.toLocaleLowerCase('vi') };
}

const DUPLICATE = { ok: false, errors: { name: 'Đã có album tên này' } };

export async function listAlbums() {
  return repo.listAlbums();
}

export async function getAlbum(id) {
  const album = await repo.findAlbum(id);
  if (!album) throw notFound('Không tìm thấy album này.');
  return album;
}

// ---------- Thư mục con trong album ----------

/** "  Ảnh lẻ \ Rồng/ " -> "Ảnh lẻ/Rồng": gọn khoảng trắng, bỏ cấp rỗng; tối đa 5 cấp, 200 ký tự. '' = không thư mục. */
export function cleanFolder(value) {
  return String(value ?? '')
    .normalize('NFC')
    .split(/[\\/]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5)
    .join('/')
    .slice(0, 200);
}

/** Ảnh nằm trong thư mục `folder` (kể cả thư mục con của nó). folder '' = cả album. */
const inFolder = (photoFolder, folder) => !folder || photoFolder === folder || photoFolder.startsWith(`${folder}/`);

const byName = (a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });

/**
 * Bộ lọc dần theo thư mục: mỗi cấp một hàng nút. Hàng đầu là các thư mục cấp 1; chọn một thư mục
 * thì hiện thêm hàng thư mục con của nó (nếu có). Mỗi nút kèm số ảnh (tính cả thư mục con).
 */
function folderFilters(photos, selected) {
  const parts = selected ? selected.split('/') : [];
  const rows = [];
  for (let depth = 0; depth <= parts.length; depth++) {
    const parent = parts.slice(0, depth).join('/');
    const inside = photos.filter((p) => inFolder(p.folder, parent));
    const counts = new Map();
    for (const p of inside) {
      const seg = p.folder.split('/')[depth];
      if (seg) counts.set(seg, (counts.get(seg) ?? 0) + 1);
    }
    if (!counts.size) break;
    rows.push({
      all: { path: parent, count: inside.length, active: selected === parent },
      items: [...counts.keys()].sort(byName).map((seg) => ({
        label: seg,
        path: parent ? `${parent}/${seg}` : seg,
        count: counts.get(seg),
        active: parts[depth] === seg,
      })),
    });
  }
  return rows;
}

const extOf = (name) => name.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? '';
/** Tên hiện dưới ảnh: bỏ đuôi .jpg cho gọn. */
const displayName = (fileName) => fileName.slice(0, fileName.length - extOf(fileName).length) || fileName;

/** Album + ảnh (đã lọc theo thư mục) + các hàng nút lọc. */
export async function getAlbumWithPhotos(id, folderInput = '') {
  const album = await getAlbum(id);
  const folder = cleanFolder(folderInput);
  const all = await repo.listPhotos(id);
  const photos = all
    .filter((p) => inFolder(p.folder, folder))
    .map((p) => ({ ...p, has_small: Boolean(p.has_small), isCover: p.id === album.cover_id, displayName: displayName(p.file_name) }));
  return { album, photos, folder, filters: folderFilters(all, folder), total: all.length };
}

export async function createAlbum(input, userId) {
  const result = validate(albumSchema, input);
  if (!result.ok) return result;
  const album = await repo.createAlbum(albumData(result.data), userId);
  return album ? { ok: true, data: album } : DUPLICATE;
}

export async function updateAlbum(id, input) {
  const result = validate(albumSchema, input);
  if (!result.ok) return result;
  const status = await repo.updateAlbum(id, albumData(result.data));
  if (status === 'missing') throw notFound('Không tìm thấy album này.');
  return status === 'duplicate' ? DUPLICATE : { ok: true, data: { id } };
}

export async function deleteAlbum(id) {
  if (!(await repo.removeAlbum(id))) throw notFound('Không tìm thấy album này.');
}

// ---------- Ảnh ----------

/**
 * Ảnh thu nhỏ trình duyệt gửi kèm (field `field`). Sai loại/quá lớn/không có thì trả null —
 * bỏ qua chứ không làm hỏng việc tải ảnh lên (thiếu thì lưới dùng cỡ lớn hơn).
 */
function thumbOf(files, field, size) {
  const file = files.find((f) => f.fieldname === field && f.size > 0 && f.size <= MAX_THUMB_BYTES);
  const kind = file && detectFileType(file.buffer, THUMB_TYPES);
  return kind ? { size, type: kind.type, data: file.buffer } : null;
}

/**
 * Bù ảnh lưới cỡ nhỏ cho ảnh tải lên trước khi có cỡ nhỏ (trang album của quản lý tự tạo từ ảnh cỡ lớn rồi gửi).
 * Trả { ok, added } — added = false khi ảnh đã có cỡ nhỏ (giữ bản cũ).
 */
export async function addSmallThumb(id, files = []) {
  if (!(await repo.findPhoto(id))) throw notFound('Không tìm thấy ảnh này.');
  const thumb = thumbOf(files, 'thumb_small', 'small');
  if (!thumb) return { ok: false, errors: { photo: 'Ảnh thu nhỏ không hợp lệ' } };
  return { ok: true, added: await repo.addThumb(id, 'small', thumb) };
}

/**
 * Thêm một ảnh. files: từ multer — "photo" (ảnh gốc, bắt buộc) + "thumb" (ảnh thu nhỏ trình duyệt tạo, tuỳ chọn).
 * Trả về { ok, data: ảnh } hoặc { ok: false, errors: { photo } }.
 */
export async function addPhoto(albumId, input, files = [], userId) {
  await getAlbum(albumId);
  const upload = files.find((f) => f.fieldname === 'photo' && f.size > 0);
  if (!upload) return { ok: false, errors: { photo: 'Vui lòng chọn ảnh' } };
  const kind = detectFileType(upload.buffer, PHOTO_TYPES);
  if (!kind) return { ok: false, errors: { photo: 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF' } };

  // "thumb" = cỡ lớn (≤1200px, xem ảnh lớn), "thumb_small" = cỡ nhỏ (cạnh ngắn ≤400px, ô lưới).
  const thumbs = [thumbOf(files, 'thumb', 'large'), thumbOf(files, 'thumb_small', 'small')].filter(Boolean);
  const { width, height } = validate(photoMetaSchema, input).data ?? {};

  const photo = await repo.createPhoto(
    albumId,
    {
      folder: cleanFolder(input?.folder),
      file_name: safeFileName(upload.originalname, `anh.${kind.ext}`),
      file_type: kind.type,
      file_size: upload.size,
      width,
      height,
      data: upload.buffer,
      thumbs,
    },
    userId,
  );
  if (!photo) throw notFound('Không tìm thấy album này.');
  return { ok: true, data: photo };
}

/**
 * Đổi tên ảnh (tên file khi tải về / trong zip). Giữ đuôi của ảnh gốc: gõ "Bình hút lộc" cho ảnh "DSC0978.JPG"
 * thành "Bình hút lộc.JPG"; bỏ ký tự Windows không cho dùng trong tên file.
 * Trả về { ok, albumId, fileName } hoặc { ok: false, albumId, errors: { name } }.
 */
export async function renamePhoto(id, input) {
  const photo = await repo.findPhoto(id);
  if (!photo) throw notFound('Không tìm thấy ảnh này.');
  const albumId = photo.album_id;
  const invalid = { ok: false, albumId, errors: { name: 'Vui lòng nhập tên ảnh' } };
  const result = validate(photoNameSchema, input);
  if (!result.ok) return { ...invalid, errors: result.errors };
  const ext = extOf(photo.file_name);
  let base = safeFileName(result.data.name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' '), '').trim();
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length).trim();
  if (!base) return invalid;
  const fileName = `${base.slice(0, 150 - ext.length)}${ext}`;
  if (!(await repo.renamePhoto(id, fileName))) throw notFound('Không tìm thấy ảnh này.');
  return { ok: true, albumId, fileName, displayName: displayName(fileName) };
}

/** Xoá ảnh, trả về id album chứa nó (để quay lại đúng album). */
export async function deletePhoto(id) {
  const photo = await repo.findPhoto(id);
  if (!photo || !(await repo.removePhoto(id))) throw notFound('Không tìm thấy ảnh này.');
  return photo.album_id;
}

export async function setCover(albumId, photoId) {
  if (!(await repo.setCover(albumId, photoId))) throw notFound('Không tìm thấy ảnh này trong album.');
}

export async function getPhotoFile(id) {
  const file = await repo.findPhotoFile(id);
  if (!file) throw notFound('Không tìm thấy ảnh này.');
  return file;
}

/** size: 'small' (ô lưới) | 'large' (mặc định: xem lớn, ảnh bìa nổi bật). */
export async function getPhotoThumb(id, size) {
  const file = await repo.findPhotoThumb(id, size === 'small' ? 'small' : 'large');
  if (!file) throw notFound('Không tìm thấy ảnh này.');
  return file;
}

/** Tên file trong zip không trùng nhau: "a.jpg", "a (2).jpg"… (so không phân biệt hoa thường như Windows). */
function uniqueName(name, used) {
  const dot = name.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let candidate = name;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Lần lượt từng ảnh gốc của album để ghi vào zip — mỗi lần chỉ đọc một ảnh, album lớn cũng không đầy bộ nhớ.
 * Ảnh bị xoá giữa chừng thì bỏ qua.
 */
export async function* albumZipEntries(albumId, folderInput = '') {
  const used = new Set();
  const folder = cleanFolder(folderInput);
  for (const { id } of (await repo.listPhotos(albumId)).filter((p) => inFolder(p.folder, folder))) {
    const file = await repo.findPhotoFile(id);
    if (!file) continue;
    yield { name: uniqueName(file.file_name, used), data: Buffer.from(file.data), date: appWallClock(file.created_at) };
  }
}

/** Tên file zip/ảnh trong header Content-Disposition: bỏ ký tự Windows không cho dùng trong tên file. */
export const downloadName = (name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'album';
