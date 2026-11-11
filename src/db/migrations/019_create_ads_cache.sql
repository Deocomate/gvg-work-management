-- Lưu tạm số liệu quảng cáo lấy từ Facebook / TikTok để không gọi API mỗi lần mở trang.
-- Mỗi dòng = một nền tảng + một khoảng ngày; payload là JSON đã chuẩn hoá.
CREATE TABLE IF NOT EXISTS ads_cache (
  cache_key  TEXT PRIMARY KEY,           -- VD: meta:2026-11-01:2026-11-11
  payload    TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
