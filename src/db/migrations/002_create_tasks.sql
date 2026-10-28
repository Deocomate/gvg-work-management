-- Công việc giao cho nhân viên theo ngày (có thể kèm khung giờ).
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL,
  note         TEXT,
  assignee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date         TEXT    NOT NULL,                 -- YYYY-MM-DD (giờ Việt Nam)
  start_time   TEXT,                             -- HH:MM, trống = cả ngày
  end_time     TEXT,                             -- HH:MM
  priority     TEXT    NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status       TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  done_at      TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_date ON tasks (assignee_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks (date);
