// Lựa chọn cố định + luật form cho checklist "Up website".
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

export const SITES = [
  { value: 'THC', label: 'GSXD · THCeramics', short: 'THCeramics', url: 'https://demo.thceramics.vn', brandKey: 'gs' },
  { value: 'GVG', label: 'GVG · Gốm Vũ Gia', short: 'Gốm Vũ Gia', url: 'https://gomvugia.vn', brandKey: 'vg' },
];

export const CATEGORIES = [
  'Trang chính', 'Doanh nghiệp', 'Sản phẩm', 'Dự án / Công trình', 'Tin tức & Kiến thức',
  'Hình ảnh & Video', 'Dịch vụ & Chính sách', 'Liên hệ', 'Kỹ thuật & SEO',
];

// Hiện trạng của trang (nhãn màu ở cột "Hiện trạng")
export const PAGE_STATUSES = [
  { value: 'ok', label: 'Gần xong', badge: 'badge-green' },
  { value: 'thieu', label: 'Thiếu nội dung', badge: 'badge-yellow' },
  { value: 'mau', label: 'Dữ liệu mẫu', badge: 'badge-red' },
  { value: 'trong', label: 'Trống', badge: 'badge-red' },
];

const values = (list) => list.map((o) => o.value);
const text = (max, message) => z.string().trim().min(1, message).max(max, 'Quá dài');

export const newPageSchema = z.object({
  site: z.enum(values(SITES)),
  title: text(120, 'Nhập tên trang'),
  path: z.preprocess(emptyToUndefined, z.string().trim().max(300, 'Đường dẫn quá dài').optional()),
  category: text(60, 'Chọn danh mục'),
});

export const pageSchema = z.object({
  category: text(60, 'Chọn danh mục'),
  status: z.enum(values(PAGE_STATUSES)),
  assignee_id: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  deadline: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ').optional()),
});

export const itemSchema = z.object({
  kind: z.enum(['item', 'todo']),
  text: text(300, 'Nhập nội dung'),
});
