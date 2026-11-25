// Luật dữ liệu cho Thư viện ảnh: form album + loại ảnh được nhận.
import { z } from 'zod';
import { emptyToUndefined } from '#lib/validate.js';
import { FILE_TYPES } from '#lib/file-types.js';

export const albumSchema = z.object({
  name: z.string({ error: 'Vui lòng nhập tên album' }).trim().min(1, 'Vui lòng nhập tên album').max(120, 'Tối đa 120 ký tự'),
});

// Kích thước ảnh do trình duyệt đọc được lúc tải lên (để lưới ảnh giữ đúng tỉ lệ). Sai/thiếu thì bỏ qua.
const dimension = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50_000).optional()).catch(undefined);
export const photoMetaSchema = z.object({ width: dimension, height: dimension });

// Ảnh gốc nhận JPG/PNG/WEBP/GIF (kiểm tra theo nội dung file). Ảnh HEIC của iPhone trình duyệt không đọc được
// -> iPhone đặt Camera > Định dạng > "Tương thích nhất", hoặc chọn ảnh qua app Ảnh (tự đổi sang JPG khi gửi).
export const PHOTO_TYPES = [FILE_TYPES.jpeg, FILE_TYPES.png, FILE_TYPES.webp, FILE_TYPES.gif];
export const THUMB_TYPES = [FILE_TYPES.webp, FILE_TYPES.jpeg, FILE_TYPES.png];
export const MAX_THUMB_BYTES = 3 * 1024 * 1024;
