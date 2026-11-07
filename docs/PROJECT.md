# Lịch công việc

> Sổ tay dự án. Claude đọc file này ĐẦU mỗi phiên làm việc và cập nhật CUỐI mỗi nhiệm vụ,
> để lần sau (hoặc người khác) tiếp tục được ngay mà không phải hỏi lại.

## Mục đích
- Ai dùng: quản lý và nhân viên trong công ty.
- Giải quyết việc gì: quản lý giao việc theo ngày/giờ; nhân viên mở app là thấy ngay hôm nay phải làm gì (dòng thời gian), xem lịch tháng, bấm Bắt đầu/Xong để báo tiến độ.

## Link
- Link chia sẻ / production: (chưa deploy)
- Repo: (chưa có)

## Tính năng
<!-- Cập nhật trạng thái: [x] xong · [ ] dự kiến -->
- [x] Khung ứng dụng (trang chủ, xử lý lỗi, bảo mật cơ bản)
- [x] Đăng nhập (admin tạo từ ADMIN_EMAIL/ADMIN_PASSWORD; tự đăng ký khi ALLOW_SIGNUP=true)
- [x] Lịch tuần ngay trên trang Hôm nay (trang chủ): dải 7 ô T2–CN, mỗi ô liệt kê việc (giờ + tên, đã xong gạch ngang, đang làm chữ vàng); bấm ngày → phần dưới hiện việc ngày đó; nút ‹ › nhảy tuần; điện thoại chỉ hiện thứ/ngày/số việc
- [x] Mỗi tài khoản mặc định chỉ thấy việc của mình; quản lý chọn được nhân viên khác hoặc "Tất cả nhân viên" (`?user=all`)
- [x] Ảnh nền xanh mờ cho toàn app (`public/img/bg.jpg`), thẻ hơi trong suốt
- [x] Hôm nay (`/today`): dòng thời gian việc trong ngày, tiến độ, nhắc việc tồn từ ngày trước, đánh dấu đang diễn ra/trễ, nút Bắt đầu/Xong/Mở lại
- [x] Lịch tháng (`/calendar`): việc theo từng ngày, chấm đỏ ngày đã qua còn việc chưa xong; bấm ngày để xem chi tiết
- [x] Giao việc (`/tasks`): tên, ghi chú, người làm, ngày, giờ bắt đầu/kết thúc (trống = cả ngày), mức độ; Lặp lại / Không lặp lại — khi lặp thì chọn thứ bằng hàng nút tròn T2…CN (mô tả "Mỗi Thứ Hai"…), lặp tới ngày chọn (tối đa 92 ngày). Có cả ở form thêm và form sửa
- [x] Link liên quan cho từng việc: ô trong form giao việc (mỗi dòng một link, tối đa 10, chỉ http/https); hiện thành nút 🔗 mở tab mới dưới ghi chú
- [x] Quyền: quản lý giao việc cho mọi người, xem theo từng nhân viên hoặc tất cả; nhân viên chỉ thấy việc của mình, tự thêm việc cá nhân, sửa/xoá việc mình tạo
- [x] Hiệu suất tuần (`/performance`, chỉ quản lý): tổng quan cả nhóm (tổng việc, % hoàn thành, % đúng hạn, quá hạn) + bảng từng người (thanh % hoàn thành xanh/vàng/cam, đã xong, đúng hạn, xong trễ, đang làm, quá hạn, so với tuần trước); chuyển tuần trước/sau; bấm tên → xem việc người đó
- [x] Nhân viên (`/staff`, chỉ quản lý): thêm/sửa/xoá tài khoản, đặt lại mật khẩu, phân vai trò, số điện thoại (không bắt buộc, bấm để gọi)
- [x] Menu "Hôm nay" có số đỏ = số việc chưa xong hôm nay
- [x] Tài liệu cần thiết: trang `/links` (menu "Tài liệu") cho mọi người xem, mở tab mới; chỉ quản lý thêm/sửa/xoá. Không hiện ở trang Hôm nay
  - Chia **thư mục** (cột trái trên máy tính, hàng nút trượt ngang trên điện thoại; có số link mỗi thư mục, mục "Chưa phân loại"). Quản lý tạo/đổi tên/xoá thư mục (xoá thì link chuyển về Chưa phân loại), chọn thư mục trong form link hoặc chọn "+ Tạo thư mục mới…" để tạo luôn (trùng tên thì dùng thư mục cũ)
  - Nút Mở / Sửa / Xoá của từng link chỉ là biểu tượng (rê chuột hiện chữ)
  - **Tìm kiếm** trong mọi thư mục theo tên, ghi chú, đường link, tên thư mục — gõ không dấu vẫn ra
  - **Xem trước** ngay trong app (cửa sổ nổi) cho link Google Drive (file, thư mục), Docs, Sheets, Slides, Forms, YouTube; link khác chỉ có nút "Mở ↗"
- [x] Giao diện tối "Dusty Bloom" (mặc định) + tuỳ chọn giao diện sáng tím "Lavender" (nút ☀/☾ trên menu, nhớ theo từng máy); ô chọn ngày/giờ/danh sách tự vẽ (`public/js/pickers.js`), lựa chọn ngắn dùng nút bấm (`form/segmented`)
- [x] Trang trí ngày lễ: tự bật 7 ngày trước lễ (thẻ tròn đếm ngược treo góc phải menu, đồ treo dưới menu, emoji rơi nhẹ phía sau nội dung, menu hắt màu lễ), hết lễ tự trở lại bình thường. Lễ: Năm mới, Tết (tới mùng 4), Valentine, 8/3, 30/4–1/5, 2/9, Trung thu, 20/10, Halloween, 20/11, Giáng sinh
- [x] Data khách hàng (`/customers`, menu "Data khách hàng"): quản lý + nhân viên vai trò **Sale** (VD: chị Trang) xem/thêm/sửa/xoá. Bấm tên khách mở thẻ chi tiết, tải PNG/PDF. Trường: loại khách (cá nhân/doanh nghiệp), tên, ngày sinh, công ty + MST (khi là doanh nghiệp), SĐT, email, Zalo, Facebook, TikTok, kênh khác (mỗi kênh một ô), địa chỉ, nguồn khách, trạng thái chăm sóc (Mới → Đang tư vấn → Đã mua → Khách quen / Ngừng), người phụ trách, mặt hàng quan tâm, ghi chú, người nhập. Hoá đơn: mỗi lần mua thêm một hoá đơn (ngày, giá trị, file PDF/ảnh ≤10MB, ghi chú hoá đơn) ngay trong form khách; trang sửa khách liệt kê hoá đơn (mở file, xoá), danh sách khách hiện tổng giá trị + số hoá đơn. Tìm theo tên/SĐT/công ty/email/mặt hàng, lọc trạng thái/nguồn/phụ trách, đếm theo trạng thái. Chặn trùng số điện thoại
- [x] Plan nội dung (`/plan`, menu "Plan", mọi người dùng) — thay cho Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD". 2 tab con:
  - **💡 Idea bank**: bảng cột theo bước Mới → Đã chọn → Đã viết kịch bản → Đã lên lịch → Đã quay → Đã đăng (cột "Bỏ" bật/tắt; cột Đã đăng chỉ hiện 12 bài mới nhất). Mỗi thẻ: tên, brand, loại video, tuyến, ngày quay/đăng, người phụ trách/viết kịch bản, link; nút bước tiếp theo (👍 Chọn · ✍ Xong kịch bản · 📅 Lên lịch · 🎬 Đã quay · ✅ Đã đăng). Lọc brand, tuyến nội dung, người (phụ trách hoặc viết kịch bản), tìm không dấu. Kéo ngang trên điện thoại. Quản lý có nút "Nhập từ Sheet" (dữ liệu chép sẵn ở `src/modules/plan/sheet-import.json`, bấm lại không trùng; tên chưa có tài khoản ghi vào Ghi chú)
  - **📤 Lịch đăng** và **🎬 Lịch quay** là 2 tab riêng (`/plan/weeks?kind=post|shoot`, `/plan/calendar?kind=…`), mỗi tab xem **Tuần** (mặc định tuần này, `&week=YYYY-MM-DD`) hoặc **Tháng**, và lọc theo brand (`&brand=`). Tuần: **mỗi brand một hàng riêng** (Vũ Gia, Klayy, GSXD, + "Chưa chọn brand" nếu có), 7 cột ngày trên máy tính / xếp dọc trên điện thoại; brand không có nội dung trong tuần thì ẩn hẳn. Lịch đăng: chỉ theo ngày (không giờ, không ghi nền tảng), cảnh báo ❗ chưa có ngày quay (không báo quá ngày đăng). Lịch quay: buổi quay theo khung giờ + 📍 địa điểm, cảnh báo ⚠ 1 người 2 nơi cùng giờ, ⏱ quay sát ngày đăng, kèm danh sách "Cần chốt ngày quay". Tháng: nhãn màu brand viết tắt (VG/KL/GS), đếm theo brand. Nút + ở mỗi ngày/hàng brand điền sẵn ngày + brand. Tên tuần như Sheet: tuần thuộc tháng chứa Thứ 5
  - **Form gọn**: phần chính (nội dung, mô tả kịch bản, link tham khảo, ngày đăng, brand, người phụ trách, bước) + 2 phần gập lại (Kịch bản · Lịch quay), tự mở khi đã có dữ liệu hoặc có lỗi. Gắn ngày quay/đăng thì Mới/Đã chọn/Đã viết kịch bản tự thành Đã lên lịch
  - **Đồng bộ lịch làm việc 2 chiều** (`plan.sync.js`): nội dung có người phụ trách tự tạo việc "🎬 Quay: …" (ngày quay, giờ đọc từ khung giờ gõ tự do như "15h00 - 15h30", địa điểm, CSVC, link kịch bản) và "📤 Đăng: …" (ngày + giờ đăng) ở Hôm nay / Tháng của người đó, có nhãn "Plan". Đổi ngày/người/trạng thái ở Plan thì việc đổi theo; bỏ ngày, bỏ người, chuyển Bỏ hoặc xoá thì việc biến mất. Tick ✓ Xong việc quay -> Plan "Đã quay", việc đăng -> "Đã đăng"; mở lại thì lùi bước. Việc từ Plan không sửa/xoá trực tiếp trên lịch (nút "Xem ở Plan")
  - Quyền: ai cũng xem/thêm; sửa + đổi trạng thái: quản lý, người tạo, người phụ trách; xoá: quản lý hoặc người tạo
- [ ] Nhắc việc qua email/Zalo/Telegram (cần dịch vụ ngoài)
- [ ] Bình luận / đính kèm file cho từng việc
<!-- [vibe:features] -->

## Dữ liệu (bảng chính)
| Bảng | Mô tả |
|------|-------|
| _migrations | (hệ thống) các migration đã chạy |
| users | tài khoản: email, tên, số điện thoại (phone, có thể trống), vai trò admin (Quản lý) / sale (Sale: như nhân viên + Data khách hàng) / member (Nhân viên) |
| tasks | công việc: tiêu đề, ghi chú, link liên quan (mỗi dòng một link), người làm (assignee_id), người tạo, ngày, giờ bắt đầu/kết thúc, mức độ, trạng thái todo/doing/done, thời điểm xong |
| links | link tài liệu cần thiết: tên, đường link (chỉ http/https), ghi chú, thư mục (folder_id, trống = Chưa phân loại) |
| link_folders | thư mục tài liệu: tên, name_key (tên viết thường, unique — chặn trùng kể cả chữ có dấu) |
| customers | khách hàng: liên hệ, loại khách, công ty/MST, nguồn, trạng thái, nhu cầu, ghi chú, người phụ trách (owner_id), người nhập (created_by); phone_digits = SĐT chỉ còn chữ số (unique) để chặn trùng |
| customer_invoices | hoá đơn của khách: ngày, giá trị (đồng), ghi chú, file (tên, loại, cỡ, nội dung BLOB); xoá khách thì xoá theo |
| tasks (thêm) | plan_id + plan_kind (shoot/post): việc lấy từ Plan nội dung (migration 014, unique theo cặp) |
| content_plans | Plan nội dung: tên, mô tả, link tham khảo (link hoặc chữ), kênh (platform), tuyến nội dung (topic), brand, loại video (video_type), người góp (proposer_id), người viết kịch bản (writer_id), kịch bản (script, link hoặc chữ), khung giờ quay (shoot_time, chữ tự do), địa điểm (location), CSVC (props), link source (source_url), ghi chú (note), trạng thái idea/selected/scripted/scheduled/filmed/posted/dropped, ngày quay, ngày + giờ đăng, link bài đã đăng, người phụ trách (owner_id), người tạo (created_by) |
<!-- [vibe:tables] -->

## Quyết định quan trọng
- Stack: Node.js 22 + Express 5 + Handlebars + Tailwind CSS 4 + SQLite (libsql).
- Không cho tự đăng ký (ALLOW_SIGNUP=false): quản lý tạo tài khoản ở trang Nhân viên. Vai trò: admin = Quản lý, member = Nhân viên.
- Việc lặp lại được tạo thành từng việc riêng cho mỗi ngày (sửa/xoá từng ngày độc lập, đơn giản, không cần chạy nền). Ngày của việc luôn là lần đầu, sau đó lặp vào các thứ đã chọn. Bật lặp lại khi SỬA việc: việc đó giữ nguyên, các ngày sau được thêm thành việc mới (trạng thái Chưa làm).
- "Thông báo" hiện là trong app (số đỏ trên menu + khung nhắc việc tồn). Email/Zalo cần dịch vụ gửi tin — chưa làm.
- Chạy trên máy bằng `chay-app.bat` = chế độ dev (tự nạp lại code). Khi deploy lên server thật vẫn dùng `npm start` (Render/PM2), không dùng chế độ này.
- Hiệu suất tính trực tiếp từ bảng tasks (không lưu riêng): "đúng hạn" = ngày bấm Xong (giờ VN, từ done_at) ≤ ngày của việc; "quá hạn" = ngày đã qua mà chưa xong. Xếp theo % hoàn thành.
- Link liên quan lưu ngay trong cột `tasks.links` (chuỗi, mỗi dòng một link) thay vì bảng riêng: đủ cho vài link/việc, việc lặp lại tự chép link sang từng ngày.
- Ai đăng nhập thì mặc định thấy việc của chính người đó (cả quản lý). Muốn xem cả nhóm: chọn "Tất cả nhân viên" (`user=all`).
- Giờ "hôm nay", "đang diễn ra", "trễ" tính theo giờ Việt Nam (APP_TIMEZONE), không theo giờ máy chủ.
- Mặc định nền tối; giao diện sáng "Lavender" là tuỳ chọn (`public/js/theme.js` đặt `data-theme="light"` trên `<html>`, lưu localStorage; nạp trong `<head>` để không nháy màu). Bản sáng chỉ khai báo lại cùng các tên màu trong `:root[data-theme="light"]`, view không phải sửa; cần khác riêng thì dùng `light:…`. Màu khai báo một chỗ trong `src/styles/app.css` (@theme): brand = cam đất (nút chính), pine = xanh rêu (đang chọn/đã xong), sun = vàng (đang làm/cảnh báo), bloom = hồng (nhấn/link), canvas/surface/raised/line/ink = nền & chữ. View dùng các tên này, không dùng slate/emerald… của Tailwind.
- Ngày lễ khai báo một chỗ trong `src/lib/holidays.js` (ngày, lời chúc, 3 emoji, số ngày trang trí thêm sau lễ); màu mỗi lễ (2 màu) trong `src/styles/app.css` theo `data-holiday`. Tết & Trung thu (âm lịch) tra bảng năm 2026–2035 — sau 2035 phải bổ sung. Hai lễ sát nhau thì hiện lễ gần nhất. Khi chạy dev xem trước được bằng `?holiday=<key>` (VD `/today?holiday=christmas`); production bỏ qua tham số này.
- Ô ngày/giờ/select trong view vẫn viết bằng thẻ chuẩn (`<input type="date|time">`, `<select>`); `pickers.js` tự thay bằng ô tự vẽ và giữ nguyên tên trường → server/test không đổi, tắt JS vẫn dùng được. Thuộc tính hỗ trợ: `data-min-from`, `data-after`, `data-clear-label`, `data-show-when="tên!=giá trị"`.

- Data khách hàng là dữ liệu nhạy cảm: không mở cho mọi nhân viên, chỉ quản lý + vai trò Sale (`users.role = 'sale'`). Ai có quyền thì sửa/xoá được mọi khách. Chặn trùng SĐT bằng unique index trên `phone_digits` (chuẩn hoá +84 → 0) để hai người nhập cùng lúc cũng không trùng.

- File hoá đơn lưu ngay trong DB (BLOB, tối đa 10MB) thay vì thư mục trên ổ đĩa: sao lưu/chuyển máy chỉ cần mang DB, chạy được cả Turso. Chỉ nhận PDF/JPG/PNG/WEBP, kiểm tra theo nội dung file (không tin đuôi). Nhận file bằng thư viện `multer` (`src/middleware/upload.js`), chạy trước csrf và chỉ khi đã đăng nhập.

- Tài liệu: tìm kiếm lọc trong JS (bỏ dấu bằng `#lib/text.js`) thay vì SQL LIKE — SQLite không bỏ dấu tiếng Việt được, số link ít nên lọc trong bộ nhớ đủ nhanh. Xem trước chỉ nhúng các dịch vụ cho phép nhúng; link nhúng do server tính trong `src/lib/link-preview.js`, CSP `frame-src` (src/app.js) chỉ mở đúng các tên miền đó — thêm dịch vụ mới phải sửa cả hai. Tài liệu Google riêng tư chỉ xem được khi trình duyệt đang đăng nhập Google có quyền.

- Plan nội dung: ý tưởng và lịch quay/đăng là CÙNG một dòng trong `content_plans` (chưa có ngày = nằm ở Idea bank, có ngày = lên lịch) — không phải chép ý tưởng sang lịch, đổi ngày là lịch tự đổi. Lịch Plan tách riêng lịch công việc (`tasks`) để không lẫn việc hằng ngày.

## Nhật ký thay đổi
<!-- Mới nhất ở trên. Mỗi dòng: ngày — thay đổi — ai yêu cầu (nếu biết) -->
- 2026-11-07 — Plan: bỏ toàn bộ emoji trên giao diện Plan (tab, thẻ, nút, cảnh báo, form). Link tham khảo / kịch bản / bài đăng dùng icon mắt xích SVG tối giản (`partials/plan/link-icon`); cảnh báo trên thẻ lịch thành nhãn chữ nhỏ (Chưa có ngày quay, Trùng giờ, Sát ngày đăng). Tên việc trên lịch làm việc ("🎬 Quay: …", "📤 Đăng: …") giữ nguyên.
- 2026-11-07 — Plan: form bỏ phần "Chi tiết ý tưởng" (người góp, ghi chú) và phần "Đăng bài" (link source, link bài đã đăng); Ngày đăng chuyển lên phần chính. Giá trị cũ của các ô đã bỏ vẫn giữ khi sửa.
- 2026-11-07 — Plan: bỏ Loại video và Tuyến nội dung khỏi form, thẻ Idea bank và bộ lọc. Cột video_type/topic vẫn giữ trong DB (dữ liệu nhập từ Sheet), sửa nội dung không xoá giá trị cũ; vẫn tìm được theo tuyến.
- 2026-11-07 — Plan: thẻ trên Lịch đăng / Lịch quay đổi sang nền trung tính + chữ đậm (dễ đọc cả sáng/tối), bước hiện tại = vạch màu trái + chấm màu, có chú thích màu (PLAN_STATUSES.bar/dot thay chip).
- 2026-11-07 — Plan: thẻ trên Lịch đăng / Lịch quay không ghi người phụ trách, thay bằng mô tả kịch bản (3 dòng) + link kịch bản; ô "Mô tả kịch bản" (cột description) đưa ra phần chính của form.
- 2026-11-07 — Plan: bỏ giờ đăng và chọn nền tảng (form, lịch, thẻ, việc "Đăng" trên lịch làm việc thành cả ngày). Cột post_time/platform vẫn giữ trong DB, không dùng.
- 2026-11-07 — Plan: bỏ cảnh báo quá ngày đăng; lịch tuần ẩn hàng brand không có nội dung.
- 2026-11-07 — Plan: tách Lịch đăng và Lịch quay thành 2 tab riêng, mỗi lịch chia hàng theo brand (tuần) / nhãn + lọc brand (tháng); Link tham khảo ra phần chính của form thêm ý tưởng.
- 2026-11-07 — Plan sắp xếp lại: Idea bank thành bảng cột theo bước, lịch tuần 7 ngày (gộp còn 2 tab, Tuần/Tháng), form gọn có phần gập lại; đồng bộ 2 chiều việc Quay/Đăng sang lịch làm việc (migration 014: tasks.plan_id/plan_kind). Sửa test việc lặp lại bị phụ thuộc ngày hôm nay.
- 2026-11-07 — Plan thay Google Sheet: thêm các cột của Sheet + trạng thái Đã chọn / Đã viết kịch bản (migration 013 dựng lại bảng content_plans), tab Plan tuần (theo ngày đăng / lịch quay, cảnh báo), nút quản lý nhập dữ liệu từ Sheet cũ. Menu chính co lại + cuộn ngang ở màn vừa, không còn tràn trang.
- 2026-11-06 — Tài liệu: chia thư mục (migration 011), ô tìm kiếm không dấu, nút Xem trước cho link Google Drive/Docs/Sheets/Slides/Forms/YouTube.
- 2026-11-04 — Thêm vai trò Sale (như nhân viên + được dùng Data khách hàng), thay cho ô tick "Được xem & nhập Data khách hàng". Migration 010 dựng lại bảng users: nhân viên đang được tick thành Sale, bỏ cột can_customers.
- 2026-11-04 — Data khách hàng: bấm tên khách mở thẻ chi tiết (tên, SĐT, địa chỉ, trạng thái, từng hoá đơn + tổng tiền), tải về PNG hoặc PDF. Chụp ảnh bằng thư viện `html-to-image` (phục vụ ở `/vendor/html-to-image.js`), PDF tự ghép trong `public/js/customer-card.js`.
- 2026-11-04 — Data khách hàng: tách ô mạng xã hội thành Zalo, Facebook, TikTok, Kênh khác (migration 009; cột social cũ thành Kênh khác).
- 2026-11-04 — Data khách hàng: thêm hoá đơn (giá trị, file đính kèm, ghi chú hoá đơn — migration 008), đổi "Nhu cầu" thành "Mặt hàng quan tâm". Sửa `numericId` để dùng được cho tham số khác `id`.
- 2026-11-04 — Thêm mục Data khách hàng (migration 007) + quyền "Được xem & nhập Data khách hàng" cho từng nhân viên (để chị Trang nhập).
- 2026-10-29 — Chỉnh màu Halloween sang tone cam bí ngô (nền cam bí ngô, viền thêu chỉ vàng ấm ánh nến).
- 2026-10-29 — Trang trí theo ngày lễ (tự bật ~1 tuần trước lễ, đang có Halloween).
- 2026-10-29 — Đổi tên app thành "Work Calendar", logo mới (`public/img/logo.svg`); menu chính căn giữa thanh menu.
- 2026-10-29 — Thêm số điện thoại cho nhân viên (cột trong danh sách + ô trong form thêm/sửa)
- 2026-10-29 — Thêm tuỳ chọn giao diện sáng tím "Lavender" (nút ☀/☾ trên menu); giao diện tối giữ nguyên.
- 2026-10-29 — Mục Lặp lại mới: "Không lặp lại / Lặp lại" + chọn thứ T2…CN (thay 3 kiểu lặp cũ); có thêm ở form sửa việc.
- 2026-10-28 — `chay-app.bat` chạy `npm run dev`: code đổi là app tự khởi động lại + tự build CSS (trước đó phải mở lại app mới thấy trang mới, gây lỗi 404 ở /performance).
- 2026-10-28 — Thêm trang Hiệu suất tuần cho quản trị viên (`/performance`).
- 2026-10-28 — Thêm "Link liên quan" cho từng việc (migration 004). Sửa lỗi ô nhiều dòng (ghi chú) bị chèn thêm dấu cách mỗi lần mở form sửa (Handlebars preventIndent).
- 2026-10-28 — Gộp lịch tuần vào trang Hôm nay (bỏ tab Tuần riêng theo yêu cầu); menu Hôm nay · Tháng.
- 2026-10-28 — Thêm lịch tuần; quản lý mặc định xem việc của chính mình; thêm ảnh nền.
- 2026-10-28 — Đổi sang giao diện tối bảng màu Dusty Bloom; ô chọn ngày/giờ/danh sách tự vẽ (có tìm nhanh không dấu, nút Hôm nay/Ngày mai, giờ kết thúc tự gợi ý); sắp lại form giao việc theo nhóm Việc gì → Ai làm · Khi nào → Tuỳ chọn, "Lặp đến ngày" chỉ hiện khi có lặp.
- 2026-10-28 — Thêm mục "Tài liệu cần thiết" (danh sách link) ở trang chủ + trang quản lý `/links`.
- 2026-10-28 — Xây bản đầu: Hôm nay, Lịch tháng, Giao việc (có lặp lại), Nhân viên, phân quyền quản lý/nhân viên.
- 2026-10-28 — Khởi tạo dự án.
