// Câu SQL cho bảng ads_cache (số liệu quảng cáo lưu tạm).
import { get, run } from '#db';

export const findCache = (key) => get('SELECT cache_key, payload, fetched_at FROM ads_cache WHERE cache_key = ?', [key]);

// Ghi đè nếu đã có: hai người bấm "Cập nhật" cùng lúc thì bản sau thắng, không lỗi trùng khoá.
export const saveCache = (key, payload) =>
  run(
    `INSERT INTO ads_cache (cache_key, payload, fetched_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    [key, JSON.stringify(payload)],
  );

// Dọn bản lưu cũ hơn 30 ngày (khoảng ngày cũ không ai mở lại).
export const pruneCache = () => run(`DELETE FROM ads_cache WHERE fetched_at < datetime('now', '-30 days')`);
