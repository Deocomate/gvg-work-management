// Câu SQL cho phần nhập tay của Báo cáo tuần (weekly_reports, weekly_social_stats, weekly_plan_items).
import { all, get, transaction } from '#db';

export const findNotes = (weekStart) =>
  get(
    `SELECT r.week_start, r.highlights, r.issues, r.next_plan, r.updated_at, u.name AS updated_by_name
     FROM weekly_reports r LEFT JOIN users u ON u.id = r.updated_by WHERE r.week_start = ?`,
    [weekStart],
  );

export const listSocial = (weekStart) =>
  all('SELECT brand, channel, followers, views, engagements FROM weekly_social_stats WHERE week_start = ?', [weekStart]);

/** Kế hoạch viết trong báo cáo tuần `weekStart` (áp dụng cho tuần sau đó). */
export const listPlanItems = (weekStart) =>
  all(
    `SELECT p.id, p.title, p.target, p.owner_id, p.brand, p.due_date, p.done, p.task_ids, u.name AS owner_name
     FROM weekly_plan_items p LEFT JOIN users u ON u.id = p.owner_id
     WHERE p.week_start = ? ORDER BY p.position, p.id`,
    [weekStart],
  );

const taskIdsJson = (p) => (p.task_ids?.length ? JSON.stringify(p.task_ids) : null);

/**
 * Lưu cả tuần trong một transaction:
 * - ghi đè nhận xét; xoá chỉ số kênh cũ rồi thêm lại các dòng có số;
 * - kế hoạch tuần tới: sửa dòng có id (giữ trạng thái Xong), thêm dòng mới, xoá dòng đã bỏ;
 * - kế hoạch tuần trước (prevWeekStart): cập nhật Xong / chưa xong theo doneIds.
 */
export function saveWeek(weekStart, { highlights, issues, next_plan }, stats, userId, { plans = [], prevWeekStart, doneIds = [] } = {}) {
  const keptIds = plans.filter((p) => p.id).map((p) => p.id);
  return transaction([
    {
      sql: `INSERT INTO weekly_reports (week_start, highlights, issues, next_plan, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT (week_start) DO UPDATE SET highlights = excluded.highlights, issues = excluded.issues,
              next_plan = excluded.next_plan, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      args: [weekStart, highlights ?? null, issues ?? null, next_plan ?? null, userId],
    },
    { sql: 'DELETE FROM weekly_social_stats WHERE week_start = ?', args: [weekStart] },
    ...stats.map((s) => ({
      sql: `INSERT INTO weekly_social_stats (week_start, brand, channel, followers, views, engagements) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [weekStart, s.brand, s.channel, s.followers ?? null, s.views ?? null, s.engagements ?? null],
    })),
    // Danh sách id truyền dạng JSON (json_each) thay vì ghép chuỗi ? vào câu SQL
    {
      sql: 'DELETE FROM weekly_plan_items WHERE week_start = ? AND id NOT IN (SELECT value FROM json_each(?))',
      args: [weekStart, JSON.stringify(keptIds)],
    },
    ...plans.map((p, position) =>
      p.id
        ? {
            // week_start trong WHERE: id gửi lên từ form không sửa được dòng của tuần khác
            sql: `UPDATE weekly_plan_items SET title = ?, target = ?, owner_id = ?, brand = ?, due_date = ?, task_ids = ?, position = ?
                  WHERE id = ? AND week_start = ?`,
            args: [p.title, p.target ?? null, p.owner_id ?? null, p.brand ?? null, p.due_date ?? null, taskIdsJson(p), position, p.id, weekStart],
          }
        : {
            sql: `INSERT INTO weekly_plan_items (week_start, title, target, owner_id, brand, due_date, task_ids, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [weekStart, p.title, p.target ?? null, p.owner_id ?? null, p.brand ?? null, p.due_date ?? null, taskIdsJson(p), position],
          },
    ),
    // Chỉ khi form có hiện danh sách tuần trước (prevWeekStart) — không thì giữ nguyên
    ...(prevWeekStart
      ? [
          {
            sql: `UPDATE weekly_plan_items SET done = CASE WHEN id IN (SELECT value FROM json_each(?)) THEN 1 ELSE 0 END
                  WHERE week_start = ?`,
            args: [JSON.stringify(doneIds), prevWeekStart],
          },
        ]
      : []),
  ]);
}
