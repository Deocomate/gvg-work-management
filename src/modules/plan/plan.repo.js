// Câu SQL cho bảng content_plans (Plan nội dung).
import { all, get, run } from '#db';

const COLUMNS = `p.id, p.title, p.description, p.reference_url, p.platform, p.topic, p.status,
  p.shoot_date, p.post_date, p.post_time, p.post_url, p.owner_id, p.created_by, p.created_at,
  o.name AS owner_name, c.name AS creator_name`;
const FROM = `FROM content_plans p
  LEFT JOIN users o ON o.id = p.owner_id
  LEFT JOIN users c ON c.id = p.created_by`;

/** Mới nhất lên đầu. Lọc tìm kiếm (không dấu) làm trong service. */
export const listAll = () => all(`SELECT ${COLUMNS} ${FROM} ORDER BY p.created_at DESC, p.id DESC`);

/** Nội dung có ngày quay hoặc ngày đăng nằm trong khoảng [from, to]. */
export const listForRange = ({ from, to }) =>
  all(
    `SELECT ${COLUMNS} ${FROM}
     WHERE (p.shoot_date BETWEEN ? AND ?) OR (p.post_date BETWEEN ? AND ?)
     ORDER BY COALESCE(p.post_time, ''), p.title COLLATE NOCASE`,
    [from, to, from, to],
  );

export const findById = (id) => get(`SELECT ${COLUMNS} ${FROM} WHERE p.id = ?`, [id]);

const FIELDS = ['title', 'description', 'reference_url', 'platform', 'topic', 'status', 'shoot_date', 'post_date', 'post_time', 'post_url', 'owner_id'];
const argsOf = (data) => FIELDS.map((f) => data[f] ?? null);
// Danh sách cột cố định do code tạo (không chứa dữ liệu người dùng).
const FIELD_LIST = FIELDS.join(', ');
const FIELD_MARKS = FIELDS.map(() => '?').join(', ');
const FIELD_SETS = FIELDS.map((f) => f + ' = ?').join(', ');

export async function create(data, createdBy) {
  const { id } = await run(
    `INSERT INTO content_plans (${FIELD_LIST}, created_by) VALUES (${FIELD_MARKS}, ?)`,
    [...argsOf(data), createdBy],
  );
  return findById(id);
}

export async function update(id, data) {
  const { changes } = await run(
    `UPDATE content_plans SET ${FIELD_SETS}, updated_at = datetime('now') WHERE id = ?`,
    [...argsOf(data), id],
  );
  return changes > 0 ? findById(id) : null;
}

export async function updateStatus(id, status) {
  const { changes } = await run(`UPDATE content_plans SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, id]);
  return changes > 0;
}

export async function remove(id) {
  const { changes } = await run('DELETE FROM content_plans WHERE id = ?', [id]);
  return changes > 0;
}

/** Các nhóm/chủ đề đã dùng — gợi ý khi nhập và làm bộ lọc. */
export const listTopics = () =>
  all(`SELECT topic, COUNT(*) AS total FROM content_plans WHERE topic IS NOT NULL AND topic <> ''
       GROUP BY topic ORDER BY topic COLLATE NOCASE`);
