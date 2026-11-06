-- Thư mục để chia link tài liệu theo nhóm (Biểu mẫu, Quy trình, Hợp đồng…).
-- Link chưa chọn thư mục (folder_id trống) hiện ở mục "Chưa phân loại".
-- Xoá thư mục: các link bên trong không mất, chỉ chuyển về "Chưa phân loại".
-- name_key = tên viết thường, gọn khoảng trắng (service tính): chặn trùng tên kể cả chữ có dấu
-- ("Biểu mẫu" và "BIỂU MẪU") — COLLATE NOCASE của SQLite chỉ hiểu chữ không dấu.
CREATE TABLE IF NOT EXISTS link_folders (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  name_key    TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE links ADD COLUMN folder_id INTEGER REFERENCES link_folders (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS links_folder_id ON links (folder_id);
