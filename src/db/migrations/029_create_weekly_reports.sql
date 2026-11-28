-- Báo cáo tuần marketing: phần nhập tay (số tự động lấy từ Nội dung, Quảng cáo, Data khách hàng — không lưu ở đây).
-- Mỗi tuần một dòng, khoá = ngày Thứ 2 của tuần.
CREATE TABLE IF NOT EXISTS weekly_reports (
  week_start  TEXT PRIMARY KEY,                       -- YYYY-MM-DD (Thứ 2)
  highlights  TEXT,                                   -- điểm nổi bật
  issues      TEXT,                                   -- vấn đề gặp phải
  next_plan   TEXT,                                   -- kế hoạch tuần tới
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chỉ số kênh mạng xã hội nhập tay mỗi tuần: một dòng cho mỗi brand + kênh. Ô để trống = NULL (không theo dõi).
CREATE TABLE IF NOT EXISTS weekly_social_stats (
  week_start   TEXT    NOT NULL,
  brand        TEXT    NOT NULL,                      -- tên brand (src/lib/brands.js)
  channel      TEXT    NOT NULL,                      -- tiktok | facebook | instagram | youtube
  followers    INTEGER,                               -- tổng follower cuối tuần
  views        INTEGER,                               -- lượt xem trong tuần
  engagements  INTEGER,                               -- tương tác trong tuần (thích, bình luận, chia sẻ)
  PRIMARY KEY (week_start, brand, channel)
);
