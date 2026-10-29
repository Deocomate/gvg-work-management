import { parseDate } from '#modules/schedule/schedule.service.js';
import * as service from './performance.service.js';

// Màu theo mức hoàn thành để quản lý nhìn lướt là thấy ai cần hỗ trợ.
const level = (value) => (value === null ? 'none' : value >= 80 ? 'good' : value >= 50 ? 'mid' : 'low');

export async function index(req, res) {
  const date = parseDate(req.query.date);
  const report = await service.getWeekReport(date);

  res.render('performance/index', {
    title: 'Hiệu suất tuần',
    ...report,
    date,
    rows: report.rows.map((row) => ({ ...row, level: level(row.completion) })),
    teamLevel: level(report.team.completion),
  });
}
