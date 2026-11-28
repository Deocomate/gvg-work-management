// Luật dữ liệu cho form nhập tay của Báo cáo tuần.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';

const note = (label) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(5000, `${label}: tối đa 5000 ký tự`).optional());

export const notesSchema = z.object({
  highlights: note('Điểm nổi bật'),
  issues: note('Vấn đề'),
  next_plan: note('Kế hoạch tuần tới'),
});

// Một ô số: trống = không theo dõi; cho phép gõ "12.500" hoặc "12,500" (bỏ dấu phân cách).
export const statNumber = z.preprocess(
  (v) => (typeof v === 'string' ? emptyToUndefined(v.replace(/[.,\s]/g, '')) : v),
  z.coerce.number({ error: 'Phải là số' }).int('Phải là số nguyên').min(0, 'Không được âm').max(1e12, 'Số quá lớn').optional(),
);

// Một dòng Kế hoạch tuần tới. Dòng để trống hết thì service bỏ qua, không báo lỗi.
const optionalText = (max, label) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `${label}: tối đa ${max} ký tự`).optional());
export const planItemSchema = z.object({
  id: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  title: z.string({ error: 'Nhập việc cần làm' }).trim().min(1, 'Nhập việc cần làm').max(300, 'Tối đa 300 ký tự'),
  target: optionalText(300, 'Mục tiêu'),
  owner_id: z.preprocess(emptyToUndefined, z.coerce.number({ error: 'Người phụ trách không hợp lệ' }).int().positive().optional()),
  brand: optionalText(50, 'Brand'),
  due_date: z.preprocess(emptyToUndefined, z.iso.date({ error: 'Ngày không hợp lệ' }).optional()),
  // Dòng lấy từ Lịch làm việc: các id việc, ô ẩn dạng "12,13"
  task_ids: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50) : []),
    z.array(z.number()),
  ),
});
export const MAX_PLAN_ITEMS = 30;
