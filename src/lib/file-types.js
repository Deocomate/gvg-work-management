// Nhận diện loại file theo NỘI DUNG (vài byte đầu), không tin đuôi/tên file người dùng gửi.
// Dùng: detectFileType(buffer, [FILE_TYPES.jpeg, FILE_TYPES.png]) -> { type, ext } | null
const bytes = (...list) => Buffer.from(list);

export const FILE_TYPES = Object.freeze({
  pdf: { type: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  jpeg: { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) },
  webp: { type: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  gif: { type: 'image/gif', ext: 'gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
});

export const detectFileType = (buffer, types) => types.find((t) => buffer?.length > 12 && t.test(buffer)) ?? null;

/** Tên file người dùng gửi -> tên an toàn để lưu và trả về khi tải (bỏ đường dẫn, ký tự điều khiển, dấu "). */
export function safeFileName(name, fallback) {
  const base = String(name ?? '').normalize('NFC').split(/[\\/]/).pop().replace(/[\u0000-\u001f"]/g, '').trim().slice(0, 150);
  return base || fallback;
}
