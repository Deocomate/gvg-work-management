// Kết quả & hiệu suất quảng cáo Facebook / TikTok.
// - Quyền: mọi quản lý (vai trò admin). Nhân viên, Sale không xem được.
// - Số liệu lấy thẳng từ API, lưu tạm ADS_CACHE_MINUTES phút trong ads_cache để nhiều lần mở trang
//   không gọi API liên tục (API có giới hạn số lần gọi). Bấm "Cập nhật ngay" thì lấy lại luôn.
// - API lỗi mà còn bản lưu cũ -> vẫn hiện bản cũ kèm cảnh báo, không để trang trống.
import { config } from '#config';
import { forbidden } from '#lib/errors.js';
import { addDays, isISODate, todayISO } from '#lib/dates.js';
import { PLATFORMS, fetchPlatform, AdsApiError } from './ads.providers.js';
import * as repo from './ads.repo.js';

export const canViewAds = (user) => user?.role === 'admin';

export function requireAdsAccess(req, res, next) {
  if (canViewAds(req.user)) return next();
  next(forbidden('Trang Quảng cáo chỉ dành cho quản lý.'));
}

export const RANGES = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: '7d', label: '7 ngày' },
  { value: '30d', label: '30 ngày' },
  { value: 'month', label: 'Tháng này' },
  { value: 'lifetime', label: 'Từ đầu chiến dịch' },
];

// Facebook chỉ trả số liệu trong 37 tháng gần nhất -> ngày tự chọn không lùi xa hơn.
const MAX_BACK_DAYS = 37 * 30;

/**
 * Đổi lựa chọn khoảng ngày thành { key, from, to } theo giờ Việt Nam.
 * - 'lifetime': toàn bộ thời gian đã chạy (from = null; sau khi lấy số liệu sẽ điền ngày đầu có chi tiêu).
 * - 'custom': ngày tự chọn custom = { from, to } (YYYY-MM-DD). Sai/thiếu thì về 7 ngày.
 */
export function resolveRange(value, today = todayISO(), custom = {}) {
  if (value === 'custom' && isISODate(custom.from) && isISODate(custom.to)) {
    let [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    const earliest = addDays(today, -MAX_BACK_DAYS);
    if (to > today) to = today;
    if (from > to) from = to;
    if (from < earliest) from = earliest;
    if (to < earliest) to = earliest;
    return { key: 'custom', from, to };
  }
  const key = RANGES.some((r) => r.value === value) ? value : '7d';
  switch (key) {
    case 'today':
      return { key, from: today, to: today };
    case 'yesterday': {
      const d = addDays(today, -1);
      return { key, from: d, to: d };
    }
    case '30d':
      return { key, from: addDays(today, -29), to: today };
    case 'month':
      return { key, from: `${today.slice(0, 7)}-01`, to: today };
    case 'lifetime':
      return { key, from: null, to: today, lifetime: true };
    default:
      return { key, from: addDays(today, -6), to: today };
  }
}

/** Tham số URL giữ nguyên khoảng ngày đang xem (chuyển trang, xuất file). Chỉ chứa giá trị đã lọc. */
export const rangeQuery = (range) =>
  range.key === 'custom' ? `range=custom&from=${range.from}&to=${range.to}` : `range=${range.key}`;

// fetched_at lưu dạng 'YYYY-MM-DD HH:MM:SS' (UTC)
const ageMinutes = (fetchedAt) => (Date.now() - Date.parse(`${fetchedAt.replace(' ', 'T')}Z`)) / 60_000;

async function loadPlatform(key, range, { force }) {
  const platform = PLATFORMS[key];
  const base = { key, label: platform.label, resultLabel: platform.resultLabel };
  if (!platform.isConfigured()) return { ...base, configured: false };

  const cacheKey = range.lifetime ? `${key}:lifetime` : `${key}:${range.from}:${range.to}`;
  const cached = await repo.findCache(cacheKey);
  if (cached && !force && ageMinutes(cached.fetched_at) < config.ads.cacheMinutes) {
    return { ...base, configured: true, ...JSON.parse(cached.payload), fetchedAt: cached.fetched_at };
  }
  try {
    const data = await fetchPlatform(key, range);
    await repo.saveCache(cacheKey, data);
    return { ...base, configured: true, ...data, fetchedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') };
  } catch (err) {
    if (!(err instanceof AdsApiError)) throw err;
    console.warn(`[ads] ${key}: ${err.message}`);
    const stale = cached ? { ...JSON.parse(cached.payload), fetchedAt: cached.fetched_at } : {};
    return { ...base, configured: true, error: err.message, ...stale };
  }
}

/**
 * Báo cáo cho trang /ads: từng nền tảng + tổng chi tiêu chung (khi cùng loại tiền).
 * custom = { from, to } khi rangeValue = 'custom'.
 */
export async function getReport(rangeValue, { force = false, custom = {} } = {}) {
  const range = resolveRange(rangeValue, todayISO(), custom);
  const platforms = await Promise.all(Object.keys(PLATFORMS).map((key) => loadPlatform(key, range, { force })));
  if (force) await repo.pruneCache();

  const withData = platforms.filter((p) => p.totals);
  const currencies = new Set(withData.map((p) => p.currency));
  const combined =
    withData.length > 1 && currencies.size === 1
      ? {
          currency: withData[0].currency,
          spend: withData.reduce((s, p) => s + p.totals.spend, 0),
          results: withData.reduce((s, p) => s + p.totals.results, 0),
          clicks: withData.reduce((s, p) => s + p.totals.clicks, 0),
        }
      : null;
  if (combined) combined.costPerResult = combined.results ? combined.spend / combined.results : null;

  // Từ đầu chiến dịch: ngày đầu tiên có chi tiêu = mốc bắt đầu của báo cáo.
  if (range.lifetime) {
    const firstDays = withData.map((p) => p.daily.find((d) => d.spend > 0)?.date).filter(Boolean).sort();
    range.from = firstDays[0] ?? null;
  }

  return { range, platforms, combined, anyConfigured: platforms.some((p) => p.configured) };
}
