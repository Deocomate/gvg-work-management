// Câu SQL cho bảng links.
import { all, get, run } from '#db';

export const listAll = () => all('SELECT id, title, url, note FROM links ORDER BY title COLLATE NOCASE');

export const findById = (id) => get('SELECT id, title, url, note FROM links WHERE id = ?', [id]);

export async function create({ title, url, note }) {
  const { id } = await run('INSERT INTO links (title, url, note) VALUES (?, ?, ?)', [title, url, note ?? null]);
  return findById(id);
}

export async function update(id, { title, url, note }) {
  const { changes } = await run(
    `UPDATE links SET title = ?, url = ?, note = ?, updated_at = datetime('now') WHERE id = ?`,
    [title, url, note ?? null, id],
  );
  return changes > 0 ? findById(id) : null;
}

export async function remove(id) {
  const { changes } = await run('DELETE FROM links WHERE id = ?', [id]);
  return changes > 0;
}
