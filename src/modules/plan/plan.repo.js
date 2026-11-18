// Câu SQL cho bảng content_plans (Plan nội dung).
import { all, get, run } from '#db';

const COLUMNS = `p.id, p.title, p.description, p.reference_url, p.platform, p.topic, p.status,
  p.shoot_date, p.post_date, p.post_time, p.post_url, p.owner_id, p.created_by, p.created_at,
  p.brand, p.video_type, p.proposer_id, p.writer_id, p.script, p.shoot_time, p.location, p.props, p.source_url, p.note,
  p.extra_reference_urls, p.shooter_id, p.poster_id,
  p.posted_fb, p.posted_tt, p.filmed, p.script_done, p.script_deadline,
  (SELECT t.status FROM tasks t WHERE t.plan_id = p.id AND t.plan_kind = 'shoot' LIMIT 1) AS shoot_task_status,
  (SELECT t.id FROM tasks t WHERE t.plan_id = p.id AND t.plan_kind = 'shoot' LIMIT 1) AS shoot_task_id,
  o.name AS owner_name, c.name AS creator_name, pr.name AS proposer_name, w.name AS writer_name,
  sh.name AS shooter_name, po.name AS poster_name`;
const FROM = `FROM content_plans p
  LEFT JOIN users o ON o.id = p.owner_id
  LEFT JOIN users c ON c.id = p.created_by
  LEFT JOIN users pr ON pr.id = p.proposer_id
  LEFT JOIN users w ON w.id = p.writer_id
  LEFT JOIN users sh ON sh.id = p.shooter_id
  LEFT JOIN users po ON po.id = p.poster_id`;

/** Mới nhất lên đầu. Lọc tìm kiếm (không dấu) làm trong service. */
export const listAll = () => all(`SELECT ${COLUMNS} ${FROM} ORDER BY p.created_at DESC, p.id DESC`);

/** Nội dung có ngày quay hoặc ngày đăng nằm trong khoảng [from, to]. */
export const listForRange = ({ from, to }) =>
  all(
    `SELECT ${COLUMNS} ${FROM}
     WHERE (p.shoot_date BETWEEN ? AND ?) OR (p.post_date BETWEEN ? AND ?)
     ORDER BY COALESCE(p.post_time, ''), COALESCE(p.shoot_time, ''), p.title COLLATE NOCASE`,
    [from, to, from, to],
  );

/** Video sắp đăng (từ hôm nay) chưa có ngày quay, chưa quay/đăng/bỏ — cho "Lịch quay". */
export const listUpcomingWithoutShoot = (today) =>
  all(
    `SELECT ${COLUMNS} ${FROM}
     WHERE p.post_date >= ? AND p.shoot_date IS NULL AND p.status NOT IN ('posted', 'dropped')
     ORDER BY p.post_date, COALESCE(p.post_time, '')`,
    [today],
  );

/**
 * Cho 3 tab Lịch đăng / Lịch quay / Kịch bản trên Lịch làm việc: nội dung chưa bỏ có ngày đăng, ngày quay
 * hoặc hạn kịch bản nằm trong [from, to] (service tự lọc lại theo từng tab).
 */
export const listForBoard = ({ from, to }) =>
  all(
    `SELECT ${COLUMNS} ${FROM}
     WHERE p.status <> 'dropped'
       AND ((p.post_date BETWEEN ? AND ?) OR (p.shoot_date BETWEEN ? AND ?) OR (p.script_deadline BETWEEN ? AND ?))
     ORDER BY p.title COLLATE NOCASE`,
    [from, to, from, to, from, to],
  );

export const findById =(id) => get(`SELECT ${COLUMNS} ${FROM} WHERE p.id = ?`, [id]);

const FIELDS = [
  'title', 'description', 'reference_url', 'platform', 'topic', 'status', 'shoot_date', 'post_date', 'post_time', 'post_url', 'owner_id',
  'brand', 'video_type', 'proposer_id', 'writer_id', 'script', 'shoot_time', 'location', 'props', 'source_url', 'note',
  'extra_reference_urls', 'shooter_id', 'poster_id',
];
const argsOf = (data) => FIELDS.map((f) => data[f] ?? null);
// Danh sách cột cố định do code tạo (không chứa dữ liệu người dùng).
const FIELD_LIST = FIELDS.join(', ');
const FIELD_MARKS = FIELDS.map(() => '?').join(', ');
const FIELD_SETS = FIELDS.map((f) => f + ' = ?').join(', ');

/** createdAt (tuỳ chọn) = ngày ghi ý tưởng gốc khi nhập từ Sheet; mặc định là lúc tạo. */
export async function create(data, createdBy, createdAt = null) {
  const { id } = await run(
    `INSERT INTO content_plans (${FIELD_LIST}, created_by, created_at)
     VALUES (${FIELD_MARKS}, ?, COALESCE(?, datetime('now')))`,
    [...argsOf(data), createdBy, createdAt],
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

/** Nội dung cùng tên + cùng ngày đăng (như exists) — để nhập lại từ Sheet bổ sung link cho nội dung đã có. */
export const findImported = ({ title, post_date }) =>
  get('SELECT id, reference_url, script, note FROM content_plans WHERE title = ? AND post_date IS ? ORDER BY id LIMIT 1', [title, post_date ?? null]);

/** Chỉ ghi link tham khảo, kịch bản, ghi chú (nhập lại từ Sheet). */
export async function updateLinks(id, { reference_url, script, note }) {
  await run(`UPDATE content_plans SET reference_url = ?, script = ?, note = ?, updated_at = datetime('now') WHERE id = ?`, [
    reference_url ?? null, script ?? null, note ?? null, id,
  ]);
}

/** Đã có nội dung cùng tên + cùng ngày đăng chưa (để nhập từ Sheet không bị trùng khi bấm 2 lần). */
export const exists = async ({ title, post_date }) =>
  Boolean(await get('SELECT 1 AS found FROM content_plans WHERE title = ? AND post_date IS ?', [title, post_date ?? null]));

/** Tick kênh đã đăng (Facebook / TikTok) + trạng thái đi kèm (đủ 2 kênh = "Đã xong"). */
export const updateChannels = (id, { posted_fb, posted_tt, status }) =>
  run(`UPDATE content_plans SET posted_fb = ?, posted_tt = ?, status = ?, updated_at = datetime('now') WHERE id = ?`, [
    posted_fb ? 1 : 0, posted_tt ? 1 : 0, status, id,
  ]);

/** Mở lại việc đăng trên lịch -> bỏ tick cả 2 kênh. */
export const resetChannels = (id) => run('UPDATE content_plans SET posted_fb = 0, posted_tt = 0 WHERE id = ?', [id]);

/** Đã quay (null = theo việc Quay trên lịch). */
export const updateFilmed = (id, value) =>
  run(`UPDATE content_plans SET filmed = ?, updated_at = datetime('now') WHERE id = ?`, [value, id]);

/** Kịch bản xong (null = tự động). */
export const updateScriptDone = (id, value) =>
  run(`UPDATE content_plans SET script_done = ?, updated_at = datetime('now') WHERE id = ?`, [value, id]);

/** Hạn kịch bản chọn riêng (null = tự tính). */
export const updateScriptDeadline = (id, date) =>
  run(`UPDATE content_plans SET script_deadline = ?, updated_at = datetime('now') WHERE id = ?`, [date, id]);
