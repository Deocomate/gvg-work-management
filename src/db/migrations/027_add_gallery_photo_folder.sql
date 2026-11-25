-- Thư viện ảnh: thư mục con của ảnh trong album (VD album "Ảnh ban men lam", folder "Ảnh lẻ/Rồng").
-- Trang album lọc dần theo từng cấp thư mục. '' = ảnh nằm ngay ở album, không thuộc thư mục con nào.
ALTER TABLE gallery_photos ADD COLUMN folder TEXT NOT NULL DEFAULT '';
