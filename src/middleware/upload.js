// Nhận file gửi lên từ form có enctype="multipart/form-data" (VD: file hoá đơn, ảnh thư viện).
// Phải chạy TRƯỚC csrf: với form có file, `_csrf` nằm trong phần multipart nên cần đọc ra trước.
// Chỉ đọc khi đã đăng nhập, để người lạ không đẩy được file lớn vào bộ nhớ máy chủ.
import multer from 'multer';
import { AppError } from '#lib/errors.js';

export const MAX_UPLOAD_MB = 10;
// Ảnh thư viện: ảnh gốc từ điện thoại/máy ảnh lớn hơn hoá đơn. Mỗi lần gửi 1 ảnh gốc + 1 ảnh thu nhỏ.
export const MAX_PHOTO_MB = 25;

const makeParser = ({ maxMb, files }) =>
  multer({
    storage: multer.memoryStorage(),
    defParamCharset: 'utf8', // tên file tiếng Việt ("hoá đơn.pdf") không bị lỗi font
    limits: { fileSize: maxMb * 1024 * 1024, files, fields: 50 },
  }).any();

const PARSERS = {
  default: { maxMb: MAX_UPLOAD_MB, files: 1, parse: makeParser({ maxMb: MAX_UPLOAD_MB, files: 1 }) },
  photo: { maxMb: MAX_PHOTO_MB, files: 2, parse: makeParser({ maxMb: MAX_PHOTO_MB, files: 2 }) },
};

export function upload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  if (!req.session?.userId) return next(new AppError(403, 'Vui lòng đăng nhập.'));
  const parser = req.path.startsWith('/library/') ? PARSERS.photo : PARSERS.default;
  parser.parse(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `File quá lớn. Tối đa ${parser.maxMb}MB, hãy chụp/scan nhỏ lại rồi thử lại.`));
    if (err instanceof multer.MulterError) {
      return next(new AppError(400, parser === PARSERS.photo ? 'Mỗi lần chỉ gửi được một ảnh.' : 'Mỗi lần chỉ gửi được một file.'));
    }
    next(err);
  });
}
