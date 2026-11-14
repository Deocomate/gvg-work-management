# Công thức tính

Nguồn: bảng P&L "Gốm Vũ Gia | P&L tháng và Điểm hòa vốn" (`docs/reference/PnL-source-sheet.txt`). Cài đặt mặc định ở mục dưới có thể đổi trong tab Cài đặt (chủ).

## 1. Lương tháng theo công (Nhài, Long)

```
công chuẩn tháng (std) = 24                                    (cố định mọi tháng; chủ có thể nhập tay để trừ ngày lễ)
đơn giá công           = lương tháng của tháng đó / std       (lương tháng của tháng đó: mức tăng lương mới nhất có from ≤ tháng đó, không có thì lấy sal.monthly)
công hưởng             = Σ theo ngày đã chấm: work/paid → 1; half → 0,5; off → 0     (mọi ngày như nhau, kể cả T7 và CN)
lương theo công        = công hưởng × đơn giá công           (làm tròn đến đồng)
phụ cấp tự túc ăn trưa = số ngày (lunch=true, T2–T6, st ∈ {work,half}) × 25.000
```
Ví dụ tháng 10/2026: std = **24**; đơn giá = 12.000.000 / 24 = 500.000 đ/công. Đi làm đủ cả tháng (22 ngày T2–T6 + 5 ngày T7 = 27 công) và tích tự túc ăn trưa cả 22 ngày T2–T6 → 27 × 500.000 (= 13.500.000) + 22 × 25.000 (= 550.000) = 14.050.000 đ, chưa tính hoa hồng. Số 24 chỉ dùng để chia lương cứng ra đơn giá công. Công hưởng không bị chặn ở std: đi làm được 25 công thì tính 25 công, tháng ít hơn 24 công thì nhận dưới lương cứng.

Thứ 7 và Chủ nhật tính như ngày thường: chấm Đi làm = 1 công, chấm Nửa buổi = 0,5 công. Muốn một ngày Thứ 7 tính 0,5 công thì chấm Nửa buổi. `rates.satFactor` và field `fullDay` của ngày không còn tác dụng.

Tăng lương (ví dụ hết thử việc) nhập ở Cài đặt, ô Tăng lương, kèm tháng áp dụng. Sửa thẳng ô Lương tháng sẽ tính lại mọi tháng, kể cả tháng đã chốt, vì chốt lương không lưu lại số cũ.

Ngày chưa chấm (quá khứ/hôm nay) **không** bị coi là nghỉ không lương: chỉ không cộng công (không hiện cảnh báo).

## 2. Lương giờ + live (Trang)

```
giờ chính     = Σ (out − in) của các ca t = main (chỉ ca có đủ in/out, out > in)
lương giờ     = giờ chính × 60.000
live trưa     80.000 đ/giờ,  live tối 120.000 đ/giờ
phần chênh    = với mỗi ca live: 
                  giờ trùng ca chính  × max(0, đơn giá live − 60.000)      // chỉ cộng phần chênh
                + giờ không trùng     × đơn giá live
phụ cấp Fanpage = cố định tháng (hồ sơ lương, mặc định 2.000.000) — trả cho giờ trực page ngoài công ty T2–CN
```

### Tự điền các ca làm (từ 13/11/2026)

Nhân viên lương giờ không còn nút bấm Bắt đầu/Kết thúc ca chính và không còn nút "Điền ca chuẩn". Thẻ Hôm nay là danh sách **ca làm**: mỗi ca một dòng giờ bắt đầu – giờ kết thúc, bấm **+ Thêm ca** để thêm ca (ví dụ 08:00–12:00 và 13:30–17:00), rồi bấm Lưu. Giờ nghỉ giữa các ca không tính lương. Các ca không được chồng giờ. Chưa xong ca thì để trống giờ kết thúc; nếu hết ngày vẫn trống thì tự đóng theo giờ chuẩn như mục 4. Ngày cũ sửa trong form của ngày (bấm vào ô lịch, nút + Thêm ca). Nút live trưa/live tối giữ nguyên.

Ví dụ: 08:00–12:00 và 13:30–17:00 → 4 + 3,5 = 7,5 giờ × 60.000 = 450.000 đ.

Ô "Nghỉ ở công ty nhưng vẫn trực page" đổi tên thành **Trực page (Nghỉ)**, cách tính giữ nguyên.

### Trực page (phụ cấp Fanpage)

Khung trực (`sal.sched`, sửa ở Cài đặt): T2–T6 **16:00–23:00**, T7 **từ giờ ra thực tế của ca chính đến 23:00** (T7 chưa có ca đủ giờ ra thì tạm tính từ 12:30), CN **09:00–23:00**.

```
giờ trực tháng     = Σ giờ trực T2–CN trong tháng (T2–T6 = 7 giờ, CN = 14 giờ, T7 = 23:00 − giờ ra thực tế)
đơn giá trực/giờ   = phụ cấp Fanpage / giờ trực tháng
trực ngày nghỉ CT  = với mỗi ngày T2–T7 có đánh dấu "trực page" và KHÔNG có ca chính:
                       giờ thêm × đơn giá                                         (cộng thêm)
giờ thêm           = từ đầu khung CN (09:00) đến đầu khung ngày đó (T2–T6 = 7 giờ 09:00–16:00, T7 = 3,5 giờ 09:00–12:30)
```
Ngày nghỉ được tính như CN (trực 09:00–23:00), nhưng phần từ 16:00 (T7: 12:30) đã nằm trong phụ cấp cố định nên chỉ cộng phần giờ thêm. CN đã nằm trong phụ cấp nên không cộng riêng.

Ví dụ 10/2026, T7 nào cũng ra lúc 12:30: 22 × 7 + 5 × 10,5 + 4 × 14 = 262,5 giờ → 2.000.000 / 262,5 ≈ 7.619 đ/giờ. Nghỉ công ty thứ 3 nhưng vẫn trực page → 7 × 7.619 = 53.333 đ. Đơn giá phụ thuộc giờ ra T7 nên chỉ chốt được khi hết tháng. Đánh dấu bằng ô "trực page" trên thẻ Hôm nay hoặc trong form sửa ngày (field `pg` của ngày). Live tối vẫn được trả theo đơn giá live như bình thường.
Vì lương giờ chính đã tính cho phần trùng, live trùng ca chỉ được thêm phần chênh (80.000−60.000 = 20.000/giờ; 120.000−60.000 = 60.000/giờ).

Ví dụ 01/10: ca chính 09:00–16:00 (7h) và live trưa 12:00–14:00 nằm trọn trong ca chính → live trưa chỉ cộng phần chênh 2h × 20.000 = 40.000 đ. Live tối 19:00–21:00 (ngoài ca chính) → 2h × 120.000 = 240.000 đ.

## 3. Hoa hồng theo doanh thu (lũy tiến, có trần)

```
quỹ_trước_trần = min(DT, t1)×r1 + max(0, min(DT, t2) − t1)×r2 + max(0, DT − t2)×r3
lãi đóng góp   = max(0, DT × (1 − cogs − ads − damage − other))
trần           = capPct × lãi đóng góp
quỹ_thực       = min(quỹ_trước_trần, trần)
hoa hồng NV    = quỹ_thực × share_NV          (làm tròn; share: Nhài 30%, Long 30%, Trang 40%)
```
Mặc định mới: `t1 = 50 triệu`, `t2 = 150 triệu`, `r = 2% / 2,5% / 3%`, `capPct = 10%`, `cogs 40% / ads 10% / damage 5% / other 0%`.

DT = 200.000.000 → 50tr×2% + 100tr×2,5% + 50tr×3% = 1.000.000 + 2.500.000 + 1.500.000 = **5.000.000**; trần = 10% × 90.000.000 = 9.000.000 → không chạm trần → Nhài 1.500.000, Long 1.500.000, Trang 2.000.000.

(Bản đầu dùng 1% / 1,5% / 2% nên quỹ là 3.000.000; đã đổi theo yêu cầu. Hệ thống đang chạy nếu đã thiết lập từ trước vẫn giữ giá trị cũ trong `cfg/main` cho đến khi chủ lưu lại ở Cài đặt.)

## 4. Tự điền giờ khi quên bấm (chỉ cho nhân viên lương giờ)

Giờ ca chuẩn (`sal.sched`, sửa ở Cài đặt): chính T2–T6 **09:00–16:00**, chính T7 **09:30–12:30**, live trưa **12:00–14:00**, live tối **19:00–21:00**. Hằng `GRACE_START = 15` phút, `GRACE_END = 30` phút.

- **Quên bấm BẮT ĐẦU**: khi bấm "Bắt đầu" muộn hơn giờ chuẩn + 15 phút → hộp thoại:
  - "Tôi quên bấm — đã làm từ {giờ chuẩn}" (ghi `in = giờ chuẩn`, `src: "auto"`; nếu đã quá giờ kết thúc chuẩn thì điền luôn cả ca `in–out`), hoặc
  - "Tôi bắt đầu từ bây giờ" (ghi giờ thực tế).
- **Quên bấm KẾT THÚC**: khi bấm "Kết thúc" muộn hơn giờ kết thúc chuẩn + 30 phút → hỏi "quên bấm (kết thúc = giờ chuẩn)" hay "vừa làm xong (giờ hiện tại)".
- **Quên hẳn đến hôm sau**: `effSegs()` tự đóng mọi ca còn mở của ngày **đã qua** bằng giờ kết thúc chuẩn khi tính lương (không ghi vào DB), đánh dấu ⏱ và cộng vào cảnh báo "N ca tự điền giờ".
- Ca còn mở của **hôm nay** chưa tính tiền (đang chạy) và không báo lỗi.

## 5. Thực nhận

```
thực nhận = lương theo công/giờ + tự túc ăn trưa + live trưa + live tối + phụ cấp Fanpage
          + hoa hồng + Σ thưởng − Σ khấu trừ
```
Thưởng/khấu trừ nhập ở tab "Thưởng & khấu trừ" (chủ), bắt buộc lý do; không cộng vào quỹ hoa hồng.

## 6. VietQR (thẻ lương)

Chuỗi EMVCo/VietQR (NAPAS 247), `vietqr(bin, acct, amount, info)`:

```
00 02 01 | 01 02 12 (tĩnh có số tiền) | 38 (A000000727 · 01:{BIN, số TK} · 02:QRIBFTTA) | 53 03 704 | 54 {số tiền} | 58 02 VN | 62 (08: nội dung ≤ 50 ký tự) | 63 04 CRC
CRC = CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) của toàn bộ chuỗi tới "6304"
Nội dung chuyển khoản: "LUONG T{tháng} {năm} {TÊN KHÔNG DẤU}"   (stripVN)
```
Test: `crc16("123456789") = 29B1` (giá trị chuẩn). Mã QR sinh ra đã được quét thử bằng OpenCV, đọc đúng chuỗi.
