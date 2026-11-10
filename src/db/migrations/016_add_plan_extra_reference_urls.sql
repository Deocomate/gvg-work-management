-- Plan nội dung: thêm "Link tham khảo 2, 3…" ngoài ô Link tham khảo chính.
-- Lưu mỗi link một dòng (thường chỉ vài link, không cần bảng riêng).
ALTER TABLE content_plans ADD COLUMN extra_reference_urls TEXT;
