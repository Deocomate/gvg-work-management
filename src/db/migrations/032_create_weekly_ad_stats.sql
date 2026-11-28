-- Số liệu quảng cáo nhập tay cho Báo cáo tuần: dùng khi không tự lấy được (token hết hạn, chưa kết nối API).
-- Có dòng ở đây thì báo cáo dùng số này thay cho số tự lấy của nền tảng đó. Tiền theo VND.
CREATE TABLE IF NOT EXISTS weekly_ad_stats (
  week_start   TEXT    NOT NULL,                      -- YYYY-MM-DD (Thứ 2)
  platform     TEXT    NOT NULL,                      -- meta | tiktok (khớp PLATFORMS trong ads.providers.js)
  spend        INTEGER,                               -- chi tiêu (đ)
  results      INTEGER,                               -- kết quả (tin nhắn, khách tiềm năng…)
  impressions  INTEGER,                               -- lượt hiển thị
  clicks       INTEGER,                               -- lượt click vào liên kết
  PRIMARY KEY (week_start, platform)
);
