// Số việc chưa xong hôm nay của người đang đăng nhập -> hiện cạnh menu "Hôm nay"
// để nhân viên mở app là biết còn bao nhiêu việc.
import { todayISO } from '#lib/dates.js';
import { countUnfinished } from '#modules/tasks/tasks.service.js';

export async function taskBadge(req, res, next) {
  if (req.user && req.method === 'GET') {
    res.locals.todayUnfinished = await countUnfinished(todayISO(), req.user.id);
  }
  next();
}
