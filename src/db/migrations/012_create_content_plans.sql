-- Plan nội dung: kho ý tưởng (Idea bank) + lịch quay / đăng bài.
-- Mỗi dòng là một nội dung đi qua các bước: Ý tưởng → Đã lên lịch → Đã quay → Đã đăng (hoặc Bỏ).
-- Chưa có ngày quay/đăng = còn nằm trong kho ý tưởng; có ngày thì hiện trên lịch.
CREATE TABLE IF NOT EXISTS content_plans (
  id             INTEGER PRIMARY KEY,
  title          TEXT    NOT NULL,
  description    TEXT,
  reference_url  TEXT,
  platform       TEXT    NOT NULL DEFAULT 'tiktok'
                 CHECK (platform IN ('tiktok', 'facebook', 'instagram', 'youtube', 'other')),
  topic          TEXT,
  status         TEXT    NOT NULL DEFAULT 'idea'
                 CHECK (status IN ('idea', 'scheduled', 'filmed', 'posted', 'dropped')),
  shoot_date     TEXT,
  post_date      TEXT,
  post_time      TEXT,
  post_url       TEXT,
  owner_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_by     INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS content_plans_shoot_date ON content_plans (shoot_date);
CREATE INDEX IF NOT EXISTS content_plans_post_date ON content_plans (post_date);
CREATE INDEX IF NOT EXISTS content_plans_status ON content_plans (status);
