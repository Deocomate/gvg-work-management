// Số việc chưa xong hôm nay của người đang đăng nhập -> hiện cạnh menu "Hôm nay"
// để nhân viên mở app là biết còn bao nhiêu việc.
// Chỉ đếm khi thật sự vẽ trang (res.render): ảnh, file tải về, JSON, chuyển trang không cần con số này —
// trang album có hàng trăm ảnh, mỗi ảnh là một lượt gọi tới server.
import { todayISO } from '#lib/dates.js';
import { countUnfinished } from '#modules/tasks/tasks.service.js';

export function taskBadge(req, res, next) {
  if (req.user && req.method === 'GET') {
    const render = res.render.bind(res);
    // Đếm lỗi thì vẫn vẽ trang, chỉ không có con số (không chuyển sang trang lỗi — trang lỗi cũng gọi render).
    res.render = (...args) => {
      countUnfinished(todayISO(), req.user.id)
        .then((count) => (res.locals.todayUnfinished = count), () => {})
        .finally(() => render(...args));
    };
  }
  next();
}
