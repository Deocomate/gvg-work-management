-- Plan nội dung chỉ còn 3 bước: Mới → Đã chọn → Đã xong (+ Bỏ, ẩn).
-- "Đã xong" dùng lại giá trị 'posted'; các bước giữa (đã viết kịch bản / đã lên lịch / đã quay) gộp vào "Đã chọn".
-- Giữ nguyên CHECK cũ của cột status (dựng lại bảng SQLite chỉ để bỏ giá trị thừa là không đáng).
UPDATE content_plans SET status = 'selected' WHERE status IN ('scripted', 'scheduled', 'filmed');
