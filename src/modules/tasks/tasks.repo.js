// Truy cập bảng tasks. CHỈ file này viết SQL cho công việc.
import { all, get, run, transaction } from '#db';

const SELECT_SQL = `SELECT t.*, u.name AS assignee_name FROM tasks t JOIN users u ON u.id = t.assignee_id`;
// Trong ngày: việc "cả ngày" trước, rồi theo giờ; việc quan trọng lên trước khi cùng giờ.
const DAY_ORDER_SQL = `ORDER BY t.start_time IS NOT NULL, t.start_time, t.priority = 'high' DESC, t.id`;

// assigneeId = null -> mọi người. Phần SQL là chuỗi cố định, giá trị đi qua args.
const byAssignee = (assigneeId) =>
  assigneeId ? { assigneeSql: 'AND t.assignee_id = ?', args: [assigneeId] } : { assigneeSql: '', args: [] };

export const findById = (id) => get(`${SELECT_SQL} WHERE t.id = ?`, [id]);

export function listForDay({ date, assigneeId }) {
  const { assigneeSql, args } = byAssignee(assigneeId);
  return all(`${SELECT_SQL} WHERE t.date = ? ${assigneeSql} ${DAY_ORDER_SQL}`, [date, ...args]);
}

export function listForRange({ from, to, assigneeId }) {
  const { assigneeSql, args } = byAssignee(assigneeId);
  return all(
    `${SELECT_SQL} WHERE t.date BETWEEN ? AND ? ${assigneeSql}
     ORDER BY t.date, t.start_time IS NOT NULL, t.start_time, t.id`,
    [from, to, ...args],
  );
}

/** Việc chưa xong của những ngày trước `beforeDate`. */
export function listOverdue({ beforeDate, assigneeId, limit = 20 }) {
  const { assigneeSql, args } = byAssignee(assigneeId);
  return all(
    `${SELECT_SQL} WHERE t.date < ? AND t.status <> 'done' ${assigneeSql}
     ORDER BY t.date DESC, t.start_time LIMIT ?`,
    [beforeDate, ...args, limit],
  );
}

export async function countUnfinished({ date, assigneeId }) {
  const row = await get(`SELECT COUNT(*) AS total FROM tasks WHERE date = ? AND assignee_id = ? AND status <> 'done'`, [
    date,
    assigneeId,
  ]);
  return Number(row.total);
}

const INSERT_SQL = `INSERT INTO tasks (title, note, assignee_id, created_by, date, start_time, end_time, priority, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
const insertArgs = (t) => [
  t.title,
  t.note ?? null,
  t.assignee_id,
  t.created_by ?? null,
  t.date,
  t.start_time ?? null,
  t.end_time ?? null,
  t.priority,
  t.status,
];

/** Thêm nhiều việc (VD việc lặp lại) trong một transaction: thêm hết hoặc không thêm gì. */
export async function createMany(tasks) {
  await transaction(tasks.map((t) => ({ sql: INSERT_SQL, args: insertArgs(t) })));
  return tasks.length;
}

export async function update(id, t) {
  await run(
    `UPDATE tasks SET title = ?, note = ?, assignee_id = ?, date = ?, start_time = ?, end_time = ?,
       priority = ?, status = ?,
       done_at = CASE WHEN ? = 'done' THEN COALESCE(done_at, datetime('now')) ELSE NULL END,
       updated_at = datetime('now')
     WHERE id = ?`,
    [t.title, t.note ?? null, t.assignee_id, t.date, t.start_time ?? null, t.end_time ?? null, t.priority, t.status, t.status, id],
  );
  return findById(id);
}

export const updateStatus = (id, status) =>
  run(
    `UPDATE tasks SET status = ?,
       done_at = CASE WHEN ? = 'done' THEN COALESCE(done_at, datetime('now')) ELSE NULL END,
       updated_at = datetime('now')
     WHERE id = ?`,
    [status, status, id],
  );

export async function remove(id) {
  const { changes } = await run('DELETE FROM tasks WHERE id = ?', [id]);
  return changes > 0;
}
