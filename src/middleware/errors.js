// 404 và xử lý lỗi tập trung. Express 5 tự chuyển lỗi của hàm async tới đây,
// nên controller KHÔNG cần try/catch chỉ để gọi next(err).
import { config } from '#config';
import { notFound } from '#lib/errors.js';

const wantsJson = (req) => req.xhr || req.path.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';

export function notFoundHandler(req, res, next) {
  next(notFound());
}

export function errorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.expose || status < 500 ? err.message : 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

  if (status >= 500 && !config.isTest) console.error(err);
  if (res.headersSent) return next(err);

  res.status(status);
  if (wantsJson(req)) return res.json({ error: message });
  res.render(status === 404 ? 'errors/404' : 'errors/error', {
    title: status === 404 ? 'Không tìm thấy' : 'Có lỗi',
    status,
    message,
    stack: config.isProd ? null : err.stack,
  });
}
