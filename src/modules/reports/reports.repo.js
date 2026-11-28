// Câu SQL cho phần nhập tay của Báo cáo tuần (weekly_reports, weekly_social_stats).
import { all, get, transaction } from '#db';

export const findNotes = (weekStart) =>
  get(
    `SELECT r.week_start, r.highlights, r.issues, r.next_plan, r.updated_at, u.name AS updated_by_name
     FROM weekly_reports r LEFT JOIN users u ON u.id = r.updated_by WHERE r.week_start = ?`,
    [weekStart],
  );

export const listSocial = (weekStart) =>
  all('SELECT brand, channel, followers, views, engagements FROM weekly_social_stats WHERE week_start = ?', [weekStart]);

/**
 * Lưu cả tuần trong một transaction: ghi đè nhận xét, xoá chỉ số cũ rồi thêm lại các dòng có số.
 * stats: [{ brand, channel, followers, views, engagements }] (đã bỏ dòng trống).
 */
export function saveWeek(weekStart, { highlights, issues, next_plan }, stats, userId) {
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
  ]);
}
