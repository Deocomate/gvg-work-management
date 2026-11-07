-- Plan nội dung thay cho Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD":
-- thêm các cột Sheet đang dùng (brand, người góp, loại video, người viết kịch bản, kịch bản,
-- khung giờ quay, địa điểm, CSVC, link source, ghi chú) và 2 trạng thái "Đã chọn", "Đã viết kịch bản".
-- topic giữ nguyên, giờ hiển thị là "Tuyến nội dung".
-- SQLite không sửa được CHECK của cột -> dựng lại bảng (tắt khoá ngoại khi DROP, như migration 010).
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
                 CHECK (status IN ('idea', 'selected', 'scripted', 'scheduled', 'filmed', 'posted', 'dropped')),
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
  note           TEXT
);

INSERT INTO content_plans_new (id, title, description, reference_url, platform, topic, status,
  shoot_date, post_date, post_time, post_url, owner_id, created_by, created_at, updated_at, proposer_id)
SELECT id, title, description, reference_url, platform, topic, status,
  shoot_date, post_date, post_time, post_url, owner_id, created_by, created_at, updated_at, created_by
FROM content_plans;

DROP TABLE content_plans;
ALTER TABLE content_plans_new RENAME TO content_plans;

CREATE INDEX IF NOT EXISTS content_plans_shoot_date ON content_plans (shoot_date);
CREATE INDEX IF NOT EXISTS content_plans_post_date ON content_plans (post_date);
CREATE INDEX IF NOT EXISTS content_plans_status ON content_plans (status);

PRAGMA foreign_keys = ON;
