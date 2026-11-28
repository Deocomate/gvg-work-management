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
