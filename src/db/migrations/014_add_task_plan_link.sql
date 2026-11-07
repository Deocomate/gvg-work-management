-- Đồng bộ Plan nội dung -> lịch làm việc: mỗi nội dung có người phụ trách tạo tối đa 2 việc
-- ("🎬 Quay: …" vào ngày quay, "📤 Đăng: …" vào ngày đăng). plan_id + plan_kind cho biết việc lấy từ đâu.
-- Xoá nội dung Plan thì các việc này tự xoá theo.
ALTER TABLE tasks ADD COLUMN plan_id INTEGER REFERENCES content_plans (id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN plan_kind TEXT CHECK (plan_kind IN ('shoot', 'post'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_plan ON tasks (plan_id, plan_kind) WHERE plan_id IS NOT NULL;
