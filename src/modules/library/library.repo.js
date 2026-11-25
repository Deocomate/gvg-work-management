// Câu SQL cho Thư viện ảnh (gallery_albums, gallery_photos).
// Cột BLOB chỉ lấy ở các hàm *File/*Thumb — danh sách không kéo nội dung ảnh lên.
// Lưu ý tốc độ (migration 028): ảnh gốc gallery_photos.data nằm giữa dòng, đọc cột đứng sau nó (folder, created_at)
// là SQLite phải đọc lướt cả ảnh gốc. Danh sách ảnh vì vậy chỉ lấy các cột có trong chỉ mục
// gallery_photos_album_list; ảnh thu nhỏ đọc ở bảng gallery_thumbs (không dùng cột thumb cũ).
import { all, get, run } from '#db';

// Ảnh bìa: ảnh được chọn làm bìa, chưa chọn thì ảnh đầu tiên của album.
const ALBUM_COLUMNS = `a.id, a.name, a.created_at, a.updated_at,
  COALESCE(a.cover_photo_id, (SELECT p.id FROM gallery_photos p WHERE p.album_id = a.id ORDER BY p.id LIMIT 1)) AS cover_id,
  (SELECT COUNT(*) FROM gallery_photos p WHERE p.album_id = a.id) AS photo_count`;

// Album mới thêm/có ảnh mới lên đầu.
export const listAlbums = () => all(`SELECT ${ALBUM_COLUMNS} FROM gallery_albums a ORDER BY a.updated_at DESC, a.id DESC`);

export const findAlbum = (id) => get(`SELECT ${ALBUM_COLUMNS} FROM gallery_albums a WHERE a.id = ?`, [id]);

/** Thêm album; trùng name_key (unique) thì trả null — hai người tạo cùng lúc cũng không trùng. */
export async function createAlbum({ name, name_key }, userId) {
  const { changes, id } = await run(
    `INSERT INTO gallery_albums (name, name_key, created_by) VALUES (?, ?, ?)
     ON CONFLICT (name_key) DO NOTHING`,
    [name, name_key, userId ?? null],
  );
  return changes > 0 ? findAlbum(id) : null;
}

/** Trả về 'ok' | 'missing' | 'duplicate'. */
export async function updateAlbum(id, { name, name_key }) {
  const { changes } = await run(
    `UPDATE OR IGNORE gallery_albums SET name = ?, name_key = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, name_key, id],
  );
  if (changes > 0) return 'ok';
  return (await findAlbum(id)) ? 'duplicate' : 'missing';
}

export async function removeAlbum(id) {
  const { changes } = await run('DELETE FROM gallery_albums WHERE id = ?', [id]);
  return changes > 0;
}

/** Chỉ đặt bìa khi ảnh đúng là của album này. */
export async function setCover(albumId, photoId) {
  const { changes } = await run(
    `UPDATE gallery_albums SET cover_photo_id = ?
     WHERE id = ? AND EXISTS (SELECT 1 FROM gallery_photos WHERE id = ? AND album_id = ?)`,
    [photoId, albumId, photoId, albumId],
  );
  return changes > 0;
}

// ---------- Ảnh ----------

const PHOTO_COLUMNS = 'id, album_id, folder, file_name, file_type, file_size, width, height, created_at';

/** has_small = đã có ảnh lưới cỡ nhỏ (chưa có thì trang album của quản lý tạo bù). */
export const listPhotos = (albumId) =>
  all(
    `SELECT ${PHOTO_COLUMNS},
       EXISTS (SELECT 1 FROM gallery_thumbs t WHERE t.photo_id = p.id AND t.size = 'small') AS has_small
     FROM gallery_photos p INDEXED BY gallery_photos_album_list WHERE album_id = ? ORDER BY id`,
    [albumId],
  );

// album_id đứng trước ảnh gốc nên đọc nhanh; phần còn lại lấy từ chỉ mục.
export const findPhoto = (id) =>
  get(
    `SELECT ${PHOTO_COLUMNS} FROM gallery_photos INDEXED BY gallery_photos_album_list
     WHERE album_id = (SELECT album_id FROM gallery_photos WHERE id = ?) AND id = ?`,
    [id, id],
  );

/** Ảnh gốc (có nội dung) — chỉ dùng khi xem/tải. */
export const findPhotoFile = (id) =>
  get('SELECT id, album_id, file_name, file_type, data, created_at FROM gallery_photos WHERE id = ?', [id]);

/**
 * Ảnh thu nhỏ cỡ `size` ('small' | 'large'). Thiếu cỡ nhỏ thì dùng cỡ lớn; thiếu cả hai thì ảnh gốc.
 * exact = đúng cỡ được hỏi (controller chỉ cho trình duyệt giữ lâu khi đúng cỡ).
 */
export async function findPhotoThumb(id, size) {
  // Hỏi cỡ nhỏ: lấy 'small' nếu có, không thì 'large' ('small' > 'large' theo thứ tự chữ nên DESC đưa small lên trước).
  const thumb = await get(
    size === 'small'
      ? `SELECT size, type, data FROM gallery_thumbs WHERE photo_id = ? ORDER BY size DESC LIMIT 1`
      : `SELECT size, type, data FROM gallery_thumbs WHERE photo_id = ? AND size = 'large'`,
    [id],
  );
  if (thumb) return { file_type: thumb.type, data: thumb.data, exact: thumb.size === size };
  const original = await get('SELECT file_type, data FROM gallery_photos WHERE id = ?', [id]);
  return original && { ...original, exact: false };
}

/** Lưu ảnh thu nhỏ một cỡ. Đã có cỡ đó (giữ bản cũ) hoặc ảnh đã bị xoá thì trả false. */
export async function addThumb(photoId, size, { type, data }) {
  const { changes } = await run(
    `INSERT INTO gallery_thumbs (photo_id, size, type, data)
     SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM gallery_photos WHERE id = ?)
     ON CONFLICT (photo_id, size) DO NOTHING`,
    [photoId, size, type, data, photoId],
  );
  return changes > 0;
}

/**
 * Thêm ảnh vào album (album bị xoá cùng lúc thì không thêm, trả null) và đẩy album lên đầu danh sách.
 * photo.thumbs = [{ size, type, data }]: ảnh thu nhỏ trình duyệt tạo sẵn.
 */
export async function createPhoto(albumId, photo, userId) {
  const { changes, id } = await run(
    `INSERT INTO gallery_photos (album_id, folder, file_name, file_type, file_size, width, height, data, created_by)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM gallery_albums WHERE id = ?)`,
    [
      albumId,
      photo.folder ?? '',
      photo.file_name,
      photo.file_type,
      photo.file_size,
      photo.width ?? null,
      photo.height ?? null,
      photo.data,
      userId ?? null,
      albumId,
    ],
  );
  if (changes === 0) return null;
  for (const thumb of photo.thumbs ?? []) await addThumb(id, thumb.size, thumb);
  await run(`UPDATE gallery_albums SET updated_at = datetime('now') WHERE id = ?`, [albumId]);
  return findPhoto(id);
}

export async function renamePhoto(id, fileName) {
  const { changes } = await run('UPDATE gallery_photos SET file_name = ? WHERE id = ?', [fileName, id]);
  return changes > 0;
}

export async function removePhoto(id) {
  const { changes } = await run('DELETE FROM gallery_photos WHERE id = ?', [id]);
  return changes > 0;
}
