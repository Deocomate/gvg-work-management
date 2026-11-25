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

/** Album + ảnh để hiển thị lưới. */
export async function getAlbumWithPhotos(id) {
  const album = await getAlbum(id);
  // Lưới kiểu tạp chí: cứ 5 ảnh thì ảnh đầu là ô lớn (2x2), khối sau đổi bên (trái, phải, trái…) cho đỡ đều đều.
  const photos = (await repo.listPhotos(id)).map((p, i) => ({
    ...p,
    isCover: p.id === album.cover_id,
    feature: i % 5 === 0,
    featureRight: i % 10 === 5,
  }));
  return { album, photos };
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
 * Thêm một ảnh. files: từ multer — "photo" (ảnh gốc, bắt buộc) + "thumb" (ảnh thu nhỏ trình duyệt tạo, tuỳ chọn).
 * Trả về { ok, data: ảnh } hoặc { ok: false, errors: { photo } }.
 */
export async function addPhoto(albumId, input, files = [], userId) {
  await getAlbum(albumId);
  const upload = files.find((f) => f.fieldname === 'photo' && f.size > 0);
  if (!upload) return { ok: false, errors: { photo: 'Vui lòng chọn ảnh' } };
  const kind = detectFileType(upload.buffer, PHOTO_TYPES);
  if (!kind) return { ok: false, errors: { photo: 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF' } };

  // Ảnh thu nhỏ sai loại/quá lớn thì bỏ qua (lưới dùng ảnh gốc), không làm hỏng việc tải ảnh lên.
  const thumbFile = files.find((f) => f.fieldname === 'thumb' && f.size > 0 && f.size <= MAX_THUMB_BYTES);
  const thumbKind = thumbFile && detectFileType(thumbFile.buffer, THUMB_TYPES);
  const { width, height } = validate(photoMetaSchema, input).data ?? {};

  const photo = await repo.createPhoto(
    albumId,
    {
      file_name: safeFileName(upload.originalname, `anh.${kind.ext}`),
      file_type: kind.type,
      file_size: upload.size,
      width,
      height,
      data: upload.buffer,
      thumb: thumbKind ? thumbFile.buffer : null,
      thumb_type: thumbKind ? thumbKind.type : null,
    },
    userId,
  );
  if (!photo) throw notFound('Không tìm thấy album này.');
  return { ok: true, data: photo };
}

const extOf = (name) => name.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? '';

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
  return { ok: true, albumId, fileName };
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

export async function getPhotoThumb(id) {
  const file = await repo.findPhotoThumb(id);
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
export async function* albumZipEntries(albumId) {
  const used = new Set();
  for (const { id } of await repo.listPhotos(albumId)) {
    const file = await repo.findPhotoFile(id);
    if (!file) continue;
    yield { name: uniqueName(file.file_name, used), data: Buffer.from(file.data), date: appWallClock(file.created_at) };
  }
}

/** Tên file zip/ảnh trong header Content-Disposition: bỏ ký tự Windows không cho dùng trong tên file. */
export const downloadName = (name) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'album';
