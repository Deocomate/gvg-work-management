-- Thêm vai trò "sale": như nhân viên, nhưng được xem & nhập Data khách hàng.
-- Thay cho ô tick users.can_customers: ai đang được tick (và là nhân viên) -> thành sale; bỏ cột can_customers.
-- SQLite không sửa được CHECK của cột -> dựng lại bảng users theo cách SQLite khuyên
-- (tắt khoá ngoại để DROP bảng cũ không kéo theo xoá việc / khách hàng đang trỏ tới users).
PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id             INTEGER PRIMARY KEY,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name           TEXT    NOT NULL,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'sale', 'member')),
  phone          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, name, password_hash, role, phone, created_at, updated_at)
SELECT id, email, name, password_hash,
       CASE WHEN role = 'member' AND can_customers = 1 THEN 'sale' ELSE role END,
       phone, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
