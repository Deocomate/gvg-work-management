// Câu SQL cho checklist "Up website" (bảng web_pages + web_items).
import { all, get, run } from '#db';

export const listPages = (site) =>
  all(
    `SELECT w.*, u.name AS assignee_name FROM web_pages w LEFT JOIN users u ON u.id = w.assignee_id
     WHERE w.site = ? ORDER BY w.sort, w.id`,
    [site],
  );

export const listItems = (site) =>
  all(
    `SELECT i.* FROM web_items i JOIN web_pages w ON w.id = i.page_id
     WHERE w.site = ? ORDER BY i.page_id, i.kind, i.sort, i.id`,
    [site],
  );

/** Số mục đã tick / tổng số mục của từng site (thanh chọn site). */
export const siteProgress = () =>
  all(
    `SELECT w.site, COUNT(i.id) AS total, COALESCE(SUM(i.done), 0) AS done
     FROM web_pages w LEFT JOIN web_items i ON i.page_id = w.id GROUP BY w.site`,
  );

export const findPage = (id) => get('SELECT * FROM web_pages WHERE id = ?', [id]);
export const findItem = (id) => get('SELECT * FROM web_items WHERE id = ?', [id]);

export async function createPage({ site, title, path, category }, createdBy) {
  const { id } = await run(
    `INSERT INTO web_pages (site, title, path, category, status, current_note, sort, created_by)
     VALUES (?, ?, ?, ?, 'trong', 'Trang thêm mới', (SELECT COALESCE(MAX(sort), 0) + 1 FROM web_pages WHERE site = ?), ?)`,
    [site, title, path, category, site, createdBy],
  );
  return findPage(id);
}

export const updatePage = (id, { category, status, assignee_id, deadline }) =>
  run(
    `UPDATE web_pages SET category = ?, status = ?, assignee_id = ?, deadline = ?, updated_at = datetime('now') WHERE id = ?`,
    [category, status, assignee_id, deadline, id],
  );

export const removePage = (id) => run('DELETE FROM web_pages WHERE id = ?', [id]);

export const addItem = ({ page_id, kind, text }) =>
  run(
    `INSERT INTO web_items (page_id, kind, text, sort)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM web_items WHERE page_id = ? AND kind = ?))`,
    [page_id, kind, text, page_id, kind],
  );

export const setItemDone = (id, done) =>
  run(`UPDATE web_items SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?`, [done, done, id]);

/** Tick hết sản phẩm / dự án của một trang. */
export const doneAllItems = (pageId) =>
  run(`UPDATE web_items SET done = 1, done_at = COALESCE(done_at, datetime('now')) WHERE page_id = ? AND kind = 'item'`, [pageId]);

export const removeItem = (id) => run('DELETE FROM web_items WHERE id = ?', [id]);
