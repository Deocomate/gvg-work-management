// Nhận file gửi lên từ form có enctype="multipart/form-data" (VD: file hoá đơn).
// Phải chạy TRƯỚC csrf: với form có file, `_csrf` nằm trong phần multipart nên cần đọc ra trước.
// Chỉ đọc khi đã đăng nhập, để người lạ không đẩy được file lớn vào bộ nhớ máy chủ.
import multer from 'multer';
import { AppError } from '#lib/errors.js';

export const MAX_UPLOAD_MB = 10;

const parser = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // tên file tiếng Việt ("hoá đơn.pdf") không bị lỗi font
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 50 },
}).any();

export function upload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  if (!req.session?.userId) return next(new AppError(403, 'Vui lòng đăng nhập.'));
  parser(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `File quá lớn. Tối đa ${MAX_UPLOAD_MB}MB, hãy chụp/scan nhỏ lại rồi thử lại.`));
    if (err instanceof multer.MulterError) return next(new AppError(400, 'Mỗi lần chỉ gửi được một file.'));
    next(err);
  });
}
