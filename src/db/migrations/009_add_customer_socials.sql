-- Mỗi kênh mạng xã hội một ô riêng (khách có thể có cả Zalo, Facebook, TikTok).
-- Cột social cũ giữ lại làm "Kênh khác" (Instagram, Shopee…), dữ liệu đã nhập không mất.
ALTER TABLE customers ADD COLUMN zalo TEXT;
ALTER TABLE customers ADD COLUMN facebook TEXT;
ALTER TABLE customers ADD COLUMN tiktok TEXT;
