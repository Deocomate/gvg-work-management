-- Thư viện ảnh chạy chậm vì cách SQLite lưu BLOB: ảnh gốc (vài MB) nằm giữa dòng gallery_photos, nên đọc các cột
-- đứng SAU nó (thumb, folder, created_at) buộc SQLite đọc lướt hết ảnh gốc. Mở album 445 ảnh = đọc ~1,5GB,
-- mỗi ảnh thu nhỏ = đọc kèm cả ảnh gốc; trong lúc đó server đứng chờ nên mọi trang khác cũng chậm theo.
--
-- 1) Ảnh thu nhỏ chuyển sang bảng riêng, mỗi ảnh có thể có 2 cỡ:
--      large = ≤1200px, xem ảnh lớn / ảnh bìa nổi bật (chính là cột thumb cũ)
--      small = cạnh ngắn ≤400px, ô lưới ảnh trong album (trình duyệt tạo lúc tải lên; ảnh cũ được trang album bù dần)
--    Cột gallery_photos.thumb cũ để nguyên (xoá/ghi đè cột phải chép lại cả 1,5GB ảnh gốc), không dùng nữa.
-- 2) Chỉ mục chứa đủ mọi cột của danh sách ảnh: liệt kê ảnh đọc thẳng từ chỉ mục, không chạm tới ảnh gốc.
CREATE TABLE IF NOT EXISTS gallery_thumbs (
  id        INTEGER PRIMARY KEY,
  photo_id  INTEGER NOT NULL REFERENCES gallery_photos (id) ON DELETE CASCADE,
  size      TEXT    NOT NULL CHECK (size IN ('small', 'large')),
  type      TEXT    NOT NULL,
  data      BLOB    NOT NULL,
  UNIQUE (photo_id, size)
);

INSERT OR IGNORE INTO gallery_thumbs (photo_id, size, type, data)
SELECT id, 'large', thumb_type, thumb FROM gallery_photos WHERE thumb IS NOT NULL AND thumb_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS gallery_photos_album_list
  ON gallery_photos (album_id, id, folder, file_name, file_type, file_size, width, height, created_at);

-- Chỉ mục cũ chỉ có album_id, chỉ mục mới đã bắt đầu bằng album_id nên thay được.
DROP INDEX IF EXISTS gallery_photos_album_id;
