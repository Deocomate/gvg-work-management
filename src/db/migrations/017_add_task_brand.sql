-- Công việc gắn brand (Vũ Gia / Klayy / GSXD) để lọc ở trang chủ. Trống = không thuộc brand nào.
ALTER TABLE tasks ADD COLUMN brand TEXT;
-- Việc lấy từ Plan nội dung nhận brand của nội dung đó.
UPDATE tasks SET brand = (SELECT p.brand FROM content_plans p WHERE p.id = tasks.plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_brand_date ON tasks (brand, date);
