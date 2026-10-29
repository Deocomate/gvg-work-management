// Trang trí theo ngày lễ: tự bật LEAD_DAYS ngày trước ngày lễ, hết lễ thì trở lại bình thường.
// Thêm/sửa ngày lễ: thêm một dòng vào HOLIDAYS (màu & trang trí khai báo ở src/styles/app.css theo `key`).
import { addDays, daysBetween } from '#lib/dates.js';

export const LEAD_DAYS = 7;

// Ngày âm lịch đổi theo năm -> tra bảng (giờ Việt Nam). Hết bảng thì lễ đó không trang trí; nhớ bổ sung năm mới.
const TET = {
  2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03',
  2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08',
};
const MID_AUTUMN = {
  2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12',
  2031: '10-01', 2032: '09-19', 2033: '09-08', 2034: '09-27', 2035: '09-16',
};

// date: 'MM-DD' (dương lịch) hoặc bảng theo năm. daysAfter: trang trí thêm mấy ngày sau lễ.
// icons: vài emoji dùng cho dải chúc mừng, đồ treo và hiệu ứng rơi.
export const HOLIDAYS = [
  { key: 'new-year', name: 'Năm mới', greeting: 'Chúc mừng năm mới!', date: '01-01', icons: ['🎉', '✨', '🎆'] },
  { key: 'tet', name: 'Tết Nguyên Đán', greeting: 'Chúc mừng năm mới — Vạn sự như ý!', date: TET, daysAfter: 3, icons: ['🧧', '🌼', '🏮'] },
  { key: 'valentine', name: 'Valentine', greeting: 'Happy Valentine!', date: '02-14', icons: ['💖', '🌹', '💌'] },
  { key: 'womens-day', name: 'Quốc tế Phụ nữ 8/3', greeting: 'Chúc mừng ngày Quốc tế Phụ nữ 8/3!', date: '03-08', icons: ['💐', '🌷', '🌸'] },
  { key: 'reunification', name: 'lễ 30/4 – 1/5', greeting: 'Mừng ngày Giải phóng miền Nam 30/4 & Quốc tế Lao động 1/5!', date: '04-30', daysAfter: 1, icons: ['⭐', '🎈', '🎊'] },
  { key: 'national-day', name: 'Quốc khánh 2/9', greeting: 'Mừng Quốc khánh 2/9!', date: '09-02', icons: ['⭐', '🎈', '🎊'] },
  { key: 'mid-autumn', name: 'Trung thu', greeting: 'Trung thu vui vẻ!', date: MID_AUTUMN, icons: ['🏮', '🥮', '🌕'] },
  { key: 'vn-womens-day', name: 'Phụ nữ Việt Nam 20/10', greeting: 'Chúc mừng ngày Phụ nữ Việt Nam 20/10!', date: '10-20', icons: ['💐', '🌷', '🌸'] },
  { key: 'halloween', name: 'Halloween', greeting: 'Happy Halloween!', date: '10-31', icons: ['🎃', '🦇', '👻'] },
  { key: 'teachers-day', name: 'Nhà giáo Việt Nam 20/11', greeting: 'Tri ân ngày Nhà giáo Việt Nam 20/11!', date: '11-20', icons: ['📚', '🌻', '💐'] },
  { key: 'christmas', name: 'Giáng sinh', greeting: 'Merry Christmas!', date: '12-25', icons: ['🎄', '❄️', '⛄'] },
];

function dateIn(holiday, year) {
  const monthDay = typeof holiday.date === 'string' ? holiday.date : holiday.date[year];
  return monthDay ? `${year}-${monthDay}` : null;
}

function withCountdown(holiday, date, today) {
  const daysLeft = daysBetween(today, date);
  let message = holiday.greeting;
  if (daysLeft === 1) message = `Ngày mai là ${holiday.name}`;
  else if (daysLeft > 1) message = `Còn ${daysLeft} ngày nữa là ${holiday.name}`;
  // Thẻ tròn treo góc chỉ đủ chỗ cho số ngày; tới ngày lễ thì đổi sang lời chào ngắn.
  const tag = daysLeft > 0 ? { count: daysLeft, label: daysLeft === 1 ? 'day left' : 'days left' } : { count: null, label: 'Vui lễ!' };
  return { key: holiday.key, name: holiday.name, icons: holiday.icons, date, daysLeft, message, tag };
}

/** Ngày lễ đang trang trí vào ngày YYYY-MM-DD (null = ngày thường). Trùng nhau thì lấy lễ gần nhất. */
export function holidayOn(today) {
  const year = Number(today.slice(0, 4));
  const active = [];
  for (const holiday of HOLIDAYS) {
    for (const y of [year - 1, year, year + 1]) {
      const date = dateIn(holiday, y);
      if (date && today >= addDays(date, -LEAD_DAYS) && today <= addDays(date, holiday.daysAfter ?? 0)) {
        active.push({ holiday, date });
      }
    }
  }
  active.sort((a, b) => a.date.localeCompare(b.date));
  return active[0] ? withCountdown(active[0].holiday, active[0].date, today) : null;
}

/** Xem trước trang trí một lễ bất kỳ (chỉ dùng khi dev: ?holiday=<key>), coi như còn 3 ngày. */
export function previewHoliday(key, today) {
  const holiday = HOLIDAYS.find((h) => h.key === key);
  return holiday ? withCountdown(holiday, addDays(today, 3), today) : null;
}
