// Biến có sẵn trong mọi view.
import { config } from '#config';
import { todayISO } from '#lib/dates.js';
import { holidayOn, previewHoliday } from '#lib/holidays.js';

// Gắn vào link CSS/JS (?v=...): mỗi lần deploy (khởi động lại) là đổi, trình duyệt tải bản mới
// thay vì dùng bản cũ đã lưu (file tĩnh được cache 7 ngày ở production).
const ASSET_VERSION = Date.now().toString(36);

export function locals(req, res, next) {
  res.locals.appName = config.appName;
  res.locals.assetVersion = ASSET_VERSION;
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();
  // Trang trí ngày lễ. Khi dev xem trước được bằng ?holiday=<key> (VD: ?holiday=christmas).
  const preview = !config.isProd && typeof req.query.holiday === 'string';
  res.locals.holiday = preview ? previewHoliday(req.query.holiday, todayISO()) : holidayOn(todayISO());
  next();
}
