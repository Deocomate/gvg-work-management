// Câu SQL cho Thư viện ảnh (gallery_albums, gallery_photos).
// Cột BLOB (data, thumb) chỉ lấy ở các hàm *File/*Thumb — danh sách không kéo nội dung ảnh lên.
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

const PHOTO_COLUMNS = 'id, album_id, file_name, file_type, file_size, width, height, created_at';

export const listPhotos = (albumId) =>
  all(`SELECT ${PHOTO_COLUMNS} FROM gallery_photos WHERE album_id = ? ORDER BY id`, [albumId]);

export const findPhoto = (id) => get(`SELECT ${PHOTO_COLUMNS} FROM gallery_photos WHERE id = ?`, [id]);

/** Ảnh gốc (có nội dung) — chỉ dùng khi xem/tải. */
export const findPhotoFile = (id) =>
  get('SELECT id, album_id, file_name, file_type, data, created_at FROM gallery_photos WHERE id = ?', [id]);

/** Ảnh thu nhỏ; ảnh không có bản thu nhỏ thì trả ảnh gốc. */
export const findPhotoThumb = (id) =>
  get(
    `SELECT COALESCE(thumb, data) AS data, CASE WHEN thumb IS NULL THEN file_type ELSE thumb_type END AS file_type
     FROM gallery_photos WHERE id = ?`,
    [id],
  );

/** Thêm ảnh vào album (album bị xoá cùng lúc thì không thêm, trả null) và đẩy album lên đầu danh sách. */
export async function createPhoto(albumId, photo, userId) {
  const { changes, id } = await run(
    `INSERT INTO gallery_photos (album_id, file_name, file_type, file_size, width, height, data, thumb, thumb_type, created_by)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM gallery_albums WHERE id = ?)`,
    [
      albumId,
      photo.file_name,
      photo.file_type,
      photo.file_size,
      photo.width ?? null,
      photo.height ?? null,
      photo.data,
      photo.thumb ?? null,
      photo.thumb_type ?? null,
      userId ?? null,
      albumId,
    ],
  );
  if (changes === 0) return null;
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
