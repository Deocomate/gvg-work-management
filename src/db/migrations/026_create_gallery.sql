-- Thư viện ảnh (menu Tài liệu > Thư viện): album ảnh, mọi người xem/tải, quản lý thêm/xoá.
-- Ảnh lưu ngay trong DB (BLOB) như file hoá đơn: sao lưu/chuyển máy chỉ cần mang DB.
-- data  = ảnh gốc (để tải về đúng bản gốc)
-- thumb = ảnh thu nhỏ do trình duyệt tạo lúc tải lên (≤1200px, WebP/JPEG) để lưới ảnh mở nhanh;
--         trống (tải lên không qua JS) thì lưới dùng ảnh gốc.
-- name_key = tên album viết thường, gọn khoảng trắng: chặn trùng tên kể cả chữ có dấu (như link_folders).
CREATE TABLE IF NOT EXISTS gallery_albums (
  id              INTEGER PRIMARY KEY,
  name            TEXT    NOT NULL,
  name_key        TEXT    NOT NULL UNIQUE,
  cover_photo_id  INTEGER REFERENCES gallery_photos (id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id          INTEGER PRIMARY KEY,
  album_id    INTEGER NOT NULL REFERENCES gallery_albums (id) ON DELETE CASCADE,
  file_name   TEXT    NOT NULL,
  file_type   TEXT    NOT NULL,
  file_size   INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  data        BLOB    NOT NULL,
  thumb       BLOB,
  thumb_type  TEXT,
  created_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS gallery_photos_album_id ON gallery_photos (album_id);
