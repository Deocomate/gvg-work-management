-- Plan nội dung: người quay và người đăng riêng (việc "Quay" / "Đăng" trên lịch làm việc giao cho từng người).
-- Trống = theo người phụ trách (owner_id) như trước.
ALTER TABLE content_plans ADD COLUMN shooter_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE content_plans ADD COLUMN poster_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
