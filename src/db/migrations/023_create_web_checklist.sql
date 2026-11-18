-- Tab "Up website": checklist launch website theo từng trang (GSXD · THCeramics và Gốm Vũ Gia).
-- Mỗi trang có danh mục, hiện trạng, người làm, deadline; bên trong là các mục cần tick:
-- kind 'item' = sản phẩm / dự án cần up (có nhóm, ghi chú), kind 'todo' = việc cần hoàn thiện.
CREATE TABLE IF NOT EXISTS web_pages (
  id           INTEGER PRIMARY KEY,
  site         TEXT    NOT NULL CHECK (site IN ('THC', 'GVG')),
  title        TEXT    NOT NULL,
  path         TEXT,
  category     TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'thieu' CHECK (status IN ('ok', 'thieu', 'mau', 'trong')),
  current_note TEXT,
  assignee_id  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  deadline     TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_web_pages_site ON web_pages (site, sort);

CREATE TABLE IF NOT EXISTS web_items (
  id         INTEGER PRIMARY KEY,
  page_id    INTEGER NOT NULL REFERENCES web_pages (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'todo' CHECK (kind IN ('item', 'todo')),
  text       TEXT    NOT NULL,
  meta       TEXT,
  grp        TEXT,
  flag       TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  done_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_web_items_page ON web_items (page_id, kind, sort);
