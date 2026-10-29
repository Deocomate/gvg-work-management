-- Link tài liệu cần thiết (Google Drive, biểu mẫu, quy trình...) hiện ở trang Hôm nay.
CREATE TABLE IF NOT EXISTS links (
  id          INTEGER PRIMARY KEY,
  title       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
