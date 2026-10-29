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
- [x] Giao diện tối "Dusty Bloom" (mặc định) + tuỳ chọn giao diện sáng tím "Lavender" (nút ☀/☾ trên menu, nhớ theo từng máy); ô chọn ngày/giờ/danh sách tự vẽ (`public/js/pickers.js`), lựa chọn ngắn dùng nút bấm (`form/segmented`)
- [x] Trang trí ngày lễ: tự bật 7 ngày trước lễ (thẻ tròn đếm ngược treo góc phải menu, đồ treo dưới menu, emoji rơi nhẹ phía sau nội dung, menu hắt màu lễ), hết lễ tự trở lại bình thường. Lễ: Năm mới, Tết (tới mùng 4), Valentine, 8/3, 30/4–1/5, 2/9, Trung thu, 20/10, Halloween, 20/11, Giáng sinh
- [ ] Nhắc việc qua email/Zalo/Telegram (cần dịch vụ ngoài)
- [ ] Bình luận / đính kèm file cho từng việc
<!-- [vibe:features] -->

## Dữ liệu (bảng chính)
| Bảng | Mô tả |
|------|-------|
| _migrations | (hệ thống) các migration đã chạy |
| users | tài khoản: email, tên, số điện thoại (phone, có thể trống), vai trò admin/member |
| tasks | công việc: tiêu đề, ghi chú, link liên quan (mỗi dòng một link), người làm (assignee_id), người tạo, ngày, giờ bắt đầu/kết thúc, mức độ, trạng thái todo/doing/done, thời điểm xong |
| links | link tài liệu cần thiết: tên, đường link (chỉ http/https), ghi chú |
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

## Nhật ký thay đổi
<!-- Mới nhất ở trên. Mỗi dòng: ngày — thay đổi — ai yêu cầu (nếu biết) -->
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
