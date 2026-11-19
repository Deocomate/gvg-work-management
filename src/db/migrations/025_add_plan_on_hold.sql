-- Plan nội dung: thêm bước "On hold" (tạm dừng, chưa làm được). Giữ nguyên ngày/người/kịch bản,
-- chỉ tạm gỡ khỏi Lịch đăng / Lịch quay / Kịch bản và lịch làm việc; bấm "Tiếp tục" là về "Đã chọn".
-- SQLite không sửa được CHECK của cột -> dựng lại bảng với đủ cột hiện có (tắt khoá ngoại khi DROP, như migration 013).
PRAGMA foreign_keys = OFF;

CREATE TABLE content_plans_new (
  id             INTEGER PRIMARY KEY,
  title          TEXT    NOT NULL,
  description    TEXT,
  reference_url  TEXT,
  platform       TEXT    NOT NULL DEFAULT 'tiktok'
                 CHECK (platform IN ('tiktok', 'facebook', 'instagram', 'youtube', 'other')),
  topic          TEXT,
  status         TEXT    NOT NULL DEFAULT 'idea'
                 CHECK (status IN ('idea', 'selected', 'scripted', 'scheduled', 'filmed', 'posted', 'dropped', 'on_hold')),
  shoot_date     TEXT,
  post_date      TEXT,
  post_time      TEXT,
  post_url       TEXT,
  owner_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_by     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  brand          TEXT,
  video_type     TEXT,
  proposer_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  writer_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  script         TEXT,
  shoot_time     TEXT,
  location       TEXT,
  props          TEXT,
  source_url     TEXT,
  note           TEXT,
  extra_reference_urls TEXT,
  shooter_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  poster_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  posted_fb      INTEGER NOT NULL DEFAULT 0,
  posted_tt      INTEGER NOT NULL DEFAULT 0,
  filmed         INTEGER,
  script_done    INTEGER,
  script_deadline TEXT
);

INSERT INTO content_plans_new (id, title, description, reference_url, platform, topic, status, shoot_date, post_date,
  post_time, post_url, owner_id, created_by, created_at, updated_at, brand, video_type, proposer_id, writer_id, script,
  shoot_time, location, props, source_url, note, extra_reference_urls, shooter_id, poster_id, posted_fb, posted_tt,
  filmed, script_done, script_deadline)
SELECT id, title, description, reference_url, platform, topic, status, shoot_date, post_date,
  post_time, post_url, owner_id, created_by, created_at, updated_at, brand, video_type, proposer_id, writer_id, script,
  shoot_time, location, props, source_url, note, extra_reference_urls, shooter_id, poster_id, posted_fb, posted_tt,
  filmed, script_done, script_deadline
FROM content_plans;

DROP TABLE content_plans;
ALTER TABLE content_plans_new RENAME TO content_plans;

CREATE INDEX IF NOT EXISTS content_plans_shoot_date ON content_plans (shoot_date);
CREATE INDEX IF NOT EXISTS content_plans_post_date ON content_plans (post_date);
CREATE INDEX IF NOT EXISTS content_plans_status ON content_plans (status);

PRAGMA foreign_keys = ON;
