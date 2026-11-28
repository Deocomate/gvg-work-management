-- Báo cáo tuần — Kế hoạch tuần tới: mỗi dòng một việc/mục tiêu.
-- week_start = Thứ 2 của tuần VIẾT báo cáo; kế hoạch áp dụng cho tuần sau đó (week_start + 7).
-- Báo cáo tuần sau hiện lại các dòng này để tick Xong / chưa xong.
CREATE TABLE IF NOT EXISTS weekly_plan_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start  TEXT    NOT NULL,
  title       TEXT    NOT NULL,                      -- việc cần làm
  target      TEXT,                                  -- mục tiêu / KPI (chữ tự do, VD "3 video, 50k view")
  owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  brand       TEXT,
  due_date    TEXT,                                  -- YYYY-MM-DD, có thể trống
  done        INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS weekly_plan_items_week ON weekly_plan_items (week_start, position);
