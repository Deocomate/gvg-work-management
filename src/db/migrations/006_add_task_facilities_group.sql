-- Cơ sở vật chất cần chuẩn bị cho việc (máy quay, phòng họp…), mỗi dòng một thứ.
ALTER TABLE tasks ADD COLUMN facilities TEXT;
-- Việc giao cho nhiều người: mỗi người một bản, các bản cùng ngày có chung group_key (trống = làm một mình).
ALTER TABLE tasks ADD COLUMN group_key TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_group_key ON tasks (group_key);
