// Đóng gói file .zip không cần thư viện ngoài. Dùng cho:
//   - file Excel (.xlsx thực chất là zip): zipBuffer({ 'tên': 'nội dung' }) -> Buffer
//   - tải cả album ảnh: createZipWriter(write) ghi lần lượt từng ảnh ra response, không giữ cả album trong bộ nhớ.
// Ảnh JPEG/PNG/WebP đã nén sẵn nên ghi nguyên (store), nén lại chỉ tốn CPU mà không nhỏ đi.
// Giới hạn: tổng < 4GB và < 65535 file (định dạng zip thường, không zip64) — dư cho một album.
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Ngày giờ theo kiểu MS-DOS mà zip dùng (giờ địa phương của người giải nén, nên truyền giờ VN). */
function dosDateTime(date) {
  if (!date || Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1980) return { time: 0, day: 0 };
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    day: ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

/**
 * write(chunk) -> boolean (như res.write). add() trả về kết quả write cuối — false thì nên đợi 'drain'.
 * date: Date mà các trường UTC đang mang giờ muốn hiện (VD giờ VN đã cộng sẵn 7 tiếng).
 */
export function createZipWriter(write) {
  const centrals = [];
  let offset = 0;
  let count = 0;

  return {
    add(name, content, { compress = false, date = null } = {}) {
      const nameBuf = Buffer.from(name, 'utf8');
      const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
      const packed = compress ? deflateRawSync(data) : data;
      const method = compress ? 8 : 0;
      const crc = crc32(data);
      const { time, day } = dosDateTime(date);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4); // phiên bản cần để giải nén
      local.writeUInt16LE(0x0800, 6); // tên file UTF-8 (tiếng Việt không lỗi font)
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(day, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(packed.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8);
      central.writeUInt16LE(method, 10);
      central.writeUInt16LE(time, 12);
      central.writeUInt16LE(day, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(packed.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt32LE(offset, 42);
      centrals.push(central, nameBuf);

      offset += local.length + nameBuf.length + packed.length;
      count += 1;
      write(Buffer.concat([local, nameBuf]));
      return write(packed);
    },

    /** Phần mục lục cuối file. Gọi một lần sau file cuối cùng. */
    finish() {
      const centralBuf = Buffer.concat(centrals);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(count, 8);
      end.writeUInt16LE(count, 10);
      end.writeUInt32LE(centralBuf.length, 12);
      end.writeUInt32LE(offset, 16);
      return write(Buffer.concat([centralBuf, end]));
    },
  };
}

/** Zip nhỏ trong bộ nhớ: { 'đường/dẫn': chuỗi | Buffer } -> Buffer (nén deflate). */
export function zipBuffer(files) {
  const chunks = [];
  const writer = createZipWriter((chunk) => chunks.push(chunk));
  for (const [name, content] of Object.entries(files)) writer.add(name, content, { compress: true });
  writer.finish();
  return Buffer.concat(chunks);
}
