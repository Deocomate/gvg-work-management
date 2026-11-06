// Câu SQL cho bảng links và link_folders (thư mục).
import { all, get, run } from '#db';

const LINK_COLUMNS = `l.id, l.title, l.url, l.note, l.folder_id, f.name AS folder_name`;

export const listAll = () =>
  all(`SELECT ${LINK_COLUMNS} FROM links l LEFT JOIN link_folders f ON f.id = l.folder_id ORDER BY l.title COLLATE NOCASE`);

export const findById = (id) =>
  get(`SELECT ${LINK_COLUMNS} FROM links l LEFT JOIN link_folders f ON f.id = l.folder_id WHERE l.id = ?`, [id]);

export async function create({ title, url, note, folder_id }) {
  const { id } = await run('INSERT INTO links (title, url, note, folder_id) VALUES (?, ?, ?, ?)', [
    title,
    url,
    note ?? null,
    folder_id ?? null,
  ]);
  return findById(id);
}

export async function update(id, { title, url, note, folder_id }) {
  const { changes } = await run(
    `UPDATE links SET title = ?, url = ?, note = ?, folder_id = ?, updated_at = datetime('now') WHERE id = ?`,
    [title, url, note ?? null, folder_id ?? null, id],
  );
  return changes > 0 ? findById(id) : null;
}

export async function remove(id) {
  const { changes } = await run('DELETE FROM links WHERE id = ?', [id]);
  return changes > 0;
}

// ---------- Thư mục ----------

export const listFolders = () =>
  all(`SELECT f.id, f.name, COUNT(l.id) AS total
       FROM link_folders f LEFT JOIN links l ON l.folder_id = f.id
       GROUP BY f.id ORDER BY f.name COLLATE NOCASE`);

export const findFolder = (id) => get('SELECT id, name FROM link_folders WHERE id = ?', [id]);

/** Thêm thư mục; trùng name_key (unique) thì bỏ qua và trả null — hai người tạo cùng lúc cũng không trùng. */
export async function createFolder({ name, name_key }) {
  const { changes, id } = await run(
    'INSERT INTO link_folders (name, name_key) VALUES (?, ?) ON CONFLICT (name_key) DO NOTHING',
    [name, name_key],
  );
  return changes > 0 ? findFolder(id) : null;
}

/** Trả về 'ok' | 'missing' | 'duplicate'. */
export async function renameFolder(id, { name, name_key }) {
  const { changes } = await run(
    `UPDATE OR IGNORE link_folders SET name = ?, name_key = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, name_key, id],
  );
  if (changes > 0) return 'ok';
  return (await findFolder(id)) ? 'duplicate' : 'missing';
}

export async function removeFolder(id) {
  // Link trong thư mục chuyển về "Chưa phân loại" (đặt rõ ở đây, không chỉ dựa vào ON DELETE SET NULL).
  await run('UPDATE links SET folder_id = NULL WHERE folder_id = ?', [id]);
  const { changes } = await run('DELETE FROM link_folders WHERE id = ?', [id]);
  return changes > 0;
}
