-- Quyền xem lương & chấm công của MỌI người (= chủ cửa hàng trong app lương). Ai không có thì chỉ thấy của mình.
-- Theo yêu cầu: chỉ sếp Mai và Nhài. Bật sẵn cho tài khoản có tên riêng "Mai" hoặc "Nhài" (so cả từ, không phân biệt hoa thường);
-- sai/thiếu thì người có quyền sửa ở trang Nhân viên. Chưa ai có quyền thì mọi Quản lý tạm có (xem payroll.access.js).
ALTER TABLE users ADD COLUMN can_payroll INTEGER NOT NULL DEFAULT 0;

UPDATE users SET can_payroll = 1
WHERE ' ' || lower(name) || ' ' LIKE '% mai %'
   OR ' ' || lower(name) || ' ' LIKE '% nhai %'
   OR ' ' || name || ' ' LIKE '% nhài %'
   OR ' ' || name || ' ' LIKE '% Nhài %'
   OR ' ' || name || ' ' LIKE '% NHÀI %';
