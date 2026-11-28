// Xuất Báo cáo tuần ra Excel (.xlsx, src/lib/xlsx.js). PDF / PNG chụp trên trình duyệt (public/js/export-image.js).
import { config } from '#config';
import { formatDayVN } from '#lib/dates.js';
import { buildXlsx } from '#lib/xlsx.js';
import { parseDate } from '#modules/schedule/schedule.service.js';
import * as service from './reports.service.js';

/** 23/11 - 29/11/2026 */
export const weekLabel = (from, to) => `${formatDayVN(from).slice(0, 5)} - ${formatDayVN(to)}`;

const head = (labels) => labels.map((v) => ({ v, s: 'head' }));
const n = (v, s = 'int') => ({ v: v ?? null, s });
const change = (cur, prev) => ({ v: cur != null && prev != null && prev !== 0 ? (cur - prev) / prev : null, s: 'pct' });

/** File Excel 5 trang: Tổng quan · Nội dung · Kênh MXH · Nhận xét · Kế hoạch. */
export function buildWorkbook(report, now = new Date()) {
  const exportedAt = new Intl.DateTimeFormat(config.locale, { dateStyle: 'short', timeStyle: 'short', timeZone: config.timezone }).format(now);
  const intro = [
    [{ v: `Báo cáo tuần marketing ${weekLabel(report.from, report.to)}`, s: 'title' }],
    [`So với tuần ${weekLabel(report.prevWeek.from, report.prevWeek.to)} · Xuất lúc ${exportedAt}`],
    [],
  ];
  const { content: c, prevContent: pc, customers: cu, prevCustomers: pcu } = report;

  const summary = [
    ...intro,
    head(['Chỉ số', 'Tuần này', 'Tuần trước', 'Thay đổi']),
    ['Video lên lịch đăng', n(c.total.planned), n(pc.planned), change(c.total.planned, pc.planned)],
    ['Video đã đăng', n(c.total.posted), n(pc.posted), change(c.total.posted, pc.posted)],
    ['Video lên lịch quay', n(c.total.shootPlanned), n(pc.shootPlanned), change(c.total.shootPlanned, pc.shootPlanned)],
    ['Video đã quay', n(c.total.shot), n(pc.shot), change(c.total.shot, pc.shot)],
    ['Khách mới', n(cu.newCustomers), n(pcu.newCustomers), change(cu.newCustomers, pcu.newCustomers)],
    ['Số hoá đơn', n(cu.invoiceCount), n(pcu.invoiceCount), change(cu.invoiceCount, pcu.invoiceCount)],
    ['Doanh thu (đ)', n(cu.revenue), n(pcu.revenue), change(cu.revenue, pcu.revenue)],
  ];
  if (report.ads?.configured) {
    for (const p of report.ads.platforms) {
      const t = p.totals;
      const pt = report.prevAds?.platforms?.find((x) => x.key === p.key)?.totals;
      const label = p.manual ? `${p.label} (nhập tay)` : p.label;
      if (!t) {
        summary.push([`${p.label}: chưa lấy được số liệu${p.error ? ` — ${p.error}` : ''}`]);
        continue;
      }
      summary.push(
        [`${label} — chi tiêu (${p.currency})`, n(t.spend), n(pt?.spend), change(t.spend, pt?.spend)],
        [`${label} — kết quả`, n(t.results), n(pt?.results), change(t.results, pt?.results)],
        [`${label} — chi phí / kết quả`, n(t.costPerResult), n(pt?.costPerResult), change(t.costPerResult, pt?.costPerResult)],
        [`${label} — hiển thị`, n(t.impressions), n(pt?.impressions), change(t.impressions, pt?.impressions)],
        [`${label} — CTR`, { v: t.ctr == null ? null : t.ctr / 100, s: 'pct' }, { v: pt?.ctr == null ? null : pt.ctr / 100, s: 'pct' }, change(t.ctr, pt?.ctr)],
      );
    }
  } else if (report.ads && !report.ads.configured) {
    summary.push(['Quảng cáo: chưa kết nối Facebook / TikTok']);
  }
  if (cu.bySource.length) {
    summary.push([], head(['Khách mới theo nguồn', 'Số khách']), ...cu.bySource.map((s) => [s.label, n(s.count)]));
  }

  const contentSheet = [
    ...intro,
    head(['Brand', 'Lên lịch đăng', 'Đã đăng', 'Lên lịch quay', 'Đã quay']),
    ...c.byBrand.map((b) => [b.brand, n(b.planned), n(b.posted), n(b.shootPlanned), n(b.shot)]),
    [{ v: 'Tổng', s: 'bold' }, n(c.total.planned, 'boldInt'), n(c.total.posted, 'boldInt'), n(c.total.shootPlanned, 'boldInt'), n(c.total.shot, 'boldInt')],
    [],
    head(['Ngày đăng', 'Video', 'Brand', 'Người đăng', 'Trạng thái']),
    ...c.posts.map((p) => [formatDayVN(p.post_date), p.title, p.brand, p.owner, p.posted ? 'Đã đăng' : 'Chưa đăng']),
  ];

  const social = [
    ...intro,
    head(['Brand', 'Kênh', 'Follower', 'Follower tăng', 'Lượt xem', 'Lượt xem tuần trước', 'Tương tác', 'Tương tác tuần trước']),
    ...report.social.map((s) => [
      s.brand, s.channel, n(s.followers), n(s.followerGain), n(s.views), n(s.prev?.views), n(s.engagements), n(s.prev?.engagements),
    ]),
  ];
  if (!report.social.length) social.push(['Chưa nhập chỉ số kênh cho tuần này']);

  const notes = [
    ...intro,
    [{ v: 'Điểm nổi bật', s: 'head' }], [report.notes.highlights || '—'], [],
    [{ v: 'Vấn đề gặp phải', s: 'head' }], [report.notes.issues || '—'],
  ];

  const nextLabel = weekLabel(report.nextWeek.from, report.nextWeek.to);
  const planHead = head(['Việc cần làm', 'Mục tiêu', 'Phụ trách', 'Brand', 'Hạn']);
  const planRow = (p) => [p.title, p.target ?? '', p.owner_name ?? '', p.brand ?? '', formatDayVN(p.due_date)];
  const planSheet = [
    ...intro,
    [{ v: `Kế hoạch tuần tới (${nextLabel})`, s: 'bold' }],
    planHead,
    ...report.planItems.map(planRow),
    ...(report.planItems.length ? [] : [['Chưa có kế hoạch']]),
    ...(report.notes.next_plan ? [[], [{ v: 'Ghi chú kế hoạch', s: 'head' }], [report.notes.next_plan]] : []),
    [],
    [{ v: `Video lên lịch tuần tới (${nextLabel})`, s: 'bold' }],
    head(['Ngày', 'Việc', 'Video', 'Brand', 'Người làm']),
    ...report.nextContent.shoots.map((v) => [formatDayVN(v.shoot_date), 'Quay', v.title, v.brand, v.owner]),
    ...report.nextContent.posts.map((v) => [formatDayVN(v.post_date), 'Đăng', v.title, v.brand, v.owner]),
  ];
  if (report.prevPlanItems.length) {
    const done = report.prevPlanItems.filter((p) => p.done).length;
    planSheet.push(
      [],
      [{ v: `Kế hoạch đề ra tuần trước — xong ${done}/${report.prevPlanItems.length}`, s: 'bold' }],
      head(['Việc cần làm', 'Mục tiêu', 'Phụ trách', 'Brand', 'Hạn', 'Kết quả']),
      ...report.prevPlanItems.map((p) => [...planRow(p), p.done ? 'Xong' : 'Chưa xong']),
    );
  }

  return buildXlsx([
    { name: 'Tổng quan', rows: summary, widths: [38, 16, 16, 12] },
    { name: 'Nội dung', rows: contentSheet, widths: [14, 50, 14, 18, 12] },
    { name: 'Kênh MXH', rows: social, widths: [14, 12, 12, 14, 12, 20, 12, 22] },
    { name: 'Nhận xét', rows: notes, widths: [100] },
    { name: 'Kế hoạch', rows: planSheet, widths: [44, 30, 20, 12, 12, 12] },
  ]);
}

export async function exportXlsx(req, res) {
  const date = parseDate(req.query.date);
  const report = await service.getWeekReport(date);
  res
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .attachment(`bao-cao-tuan-${report.from}.xlsx`)
    .send(buildWorkbook(report));
}
