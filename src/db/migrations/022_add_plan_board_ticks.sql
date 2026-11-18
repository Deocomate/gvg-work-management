-- Tab Lịch đăng / Lịch quay / Kịch bản trên Lịch làm việc: mỗi tab tick riêng một việc.
-- posted_fb / posted_tt: đã đăng lên Facebook / TikTok (đủ cả 2 kênh thì nội dung "Đã xong").
-- filmed: đã quay — NULL = theo việc "Quay" trên lịch (tick xong ở đó là đã quay).
-- script_done: kịch bản xong — NULL = tự động (đã quay thì coi như có kịch bản).
-- script_deadline: hạn kịch bản chọn riêng — NULL = tự tính theo ngày đăng / ngày quay.
ALTER TABLE content_plans ADD COLUMN posted_fb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_plans ADD COLUMN posted_tt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE content_plans ADD COLUMN filmed INTEGER;
ALTER TABLE content_plans ADD COLUMN script_done INTEGER;
ALTER TABLE content_plans ADD COLUMN script_deadline TEXT;
