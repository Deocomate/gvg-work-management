-- Liên kết tài khoản lịch công việc với tài khoản Lương (đăng nhập Lương tự động theo tài khoản này).
-- 'admin' = chủ cửa hàng (toàn quyền lương, nhiều quản lý dùng chung được); 'nv1', 'nv2'… = một nhân viên lương (mỗi người 1 tài khoản).
ALTER TABLE users ADD COLUMN payroll_who TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_payroll_who_unique ON users(payroll_who)
  WHERE payroll_who IS NOT NULL AND payroll_who <> 'admin';
