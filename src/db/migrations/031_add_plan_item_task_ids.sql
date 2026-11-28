-- Kế hoạch tuần tới lấy từ Lịch làm việc: nhớ các việc (tasks.id) mà dòng kế hoạch đại diện, dạng JSON "[12,13]".
-- Có task_ids thì trạng thái Xong tính theo các việc đó trên lịch (không tick tay); trống = dòng gõ tay.
ALTER TABLE weekly_plan_items ADD COLUMN task_ids TEXT;
