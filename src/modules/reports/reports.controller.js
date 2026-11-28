import { config } from '#config';
import { BRANDS, brandInfo } from '#lib/brands.js';
import { formatDayVN } from '#lib/dates.js';
import { buildXlsx } from '#lib/xlsx.js';
import { parseDate } from '#modules/schedule/schedule.service.js';
import * as service from './reports.service.js';

const int = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 2 });
const num = (v) => (v == null ? '—' : int.format(v));
const money = (v, currency = 'VND') =>
  v == null ? '—' : currency === 'VND' ? `${int.format(v)} ₫` : `${dec.format(v)} ${currency}`;
const pctText = (v) => (v == null ? '—' : `${dec.format(v)}%`);

/**
 * So với tuần trước -> { text: '▲ 20%', tone: 'up' | 'down' | 'same' | 'none' }.
 * neutral = chỉ số mà tăng chưa chắc là tốt (chi tiêu, chi phí) -> không tô xanh/đỏ.
 */
export function delta(cur, prev, { neutral = false, lowerIsBetter = false } = {}) {
  if (cur == null || prev == null || (cur === 0 && prev === 0)) return { text: '', tone: 'none' };
  if (cur === prev) return { text: '= tuần trước', tone: 'same' };
  const up = cur > prev;
  const arrow = up ? '▲' : '▼';
  const text = prev === 0 ? `${arrow} từ 0` : `${arrow} ${Math.abs(Math.round(((cur - prev) / prev) * 100))}%`;
  const good = lowerIsBetter ? !up : up;
  return { text, tone: neutral ? 'same' : good ? 'up' : 'down' };
}

const weekLabel = (from, to) => `${formatDayVN(from).slice(0, 5)} - ${formatDayVN(to)}`;

function presentAds(ads, prevAds) {
  if (!ads?.configured) return ads;
  const prevOf = (key) => prevAds?.platforms?.find((p) => p.key === key)?.totals ?? null;
  const platforms = ads.platforms.map((p) => {
    const t = p.totals;
    const pt = prevOf(p.key);
    return {
      ...p,
      rows: t && [
        { label: 'Chi tiêu', value: money(t.spend, p.currency), delta: delta(t.spend, pt?.spend, { neutral: true }) },
        { label: 'Kết quả', value: num(t.results), delta: delta(t.results, pt?.results) },
        { label: 'Chi phí / kết quả', value: money(t.costPerResult, p.currency), delta: delta(t.costPerResult, pt?.costPerResult, { lowerIsBetter: true }) },
        { label: 'Hiển thị', value: num(t.impressions), delta: delta(t.impressions, pt?.impressions) },
        { label: 'CTR', value: pctText(t.ctr), delta: delta(t.ctr, pt?.ctr) },
      ],
    };
  });
  const c = ads.combined;
  const pc = prevAds?.combined;
  return {
    ...ads,
    platforms,
    combined: c && {
      spend: money(c.spend, c.currency),
      spendDelta: delta(c.spend, pc?.spend, { neutral: true }),
      results: num(c.results),
      resultsDelta: delta(c.results, pc?.results),
      costPerResult: money(c.costPerResult, c.currency),
      costDelta: delta(c.costPerResult, pc?.costPerResult, { lowerIsBetter: true }),
    },
  };
}

/** Dữ liệu đã định dạng sẵn cho view. */
function present(report) {
  const { content, prevContent, customers, prevCustomers } = report;
  const t = content.total;
  const posted = { value: `${t.posted}/${t.planned}`, delta: delta(t.posted, prevContent.posted) };
  return {
    ...report,
    label: weekLabel(report.from, report.to),
    prevLabel: weekLabel(report.prevWeek.from, report.prevWeek.to),
    kpis: [
      { label: 'Video đã đăng', value: posted.value, sub: 'đã đăng / lên lịch', delta: posted.delta },
      { label: 'Khách mới', value: num(customers.newCustomers), sub: 'nhập vào Data khách hàng', delta: delta(customers.newCustomers, prevCustomers.newCustomers) },
      { label: 'Doanh thu', value: money(customers.revenue), sub: `${customers.invoiceCount} hoá đơn`, delta: delta(customers.revenue, prevCustomers.revenue) },
    ],
    posts: content.posts.map((p) => ({ ...p, badge: brandInfo(p.brand)?.badge ?? 'badge-gray' })),
    ads: presentAds(report.ads, report.prevAds),
    social: report.social.map((s) => ({
      ...s,
      badge: brandInfo(s.brand)?.badge ?? 'badge-gray',
      f: { followers: num(s.followers), views: num(s.views), engagements: num(s.engagements) },
      gain: s.followerGain == null ? '' : `${s.followerGain >= 0 ? '+' : ''}${int.format(s.followerGain)}`,
      gainTone: s.followerGain == null ? 'none' : s.followerGain > 0 ? 'up' : s.followerGain < 0 ? 'down' : 'same',
      viewsDelta: delta(s.views, s.prev?.views),
      engagementsDelta: delta(s.engagements, s.prev?.engagements),
    })),
    revenueText: money(customers.revenue),
    hasNotes: Boolean(report.notes.highlights || report.notes.issues || report.notes.next_plan),
  };
}

export async function index(req, res) {
  const date = parseDate(req.query.date);
  const report = present(await service.getWeekReport(date));
  res.render('reports/index', {
    title: 'Báo cáo tuần',
    ...report,
    exportFilename: `bao-cao-tuan-${report.from}`,
  });
}

// ---------------------------------------------------------------- Nhập tay

function formView(form, errors = {}) {
  return {
    title: 'Nhập báo cáo tuần',
    ...form,
    label: weekLabel(form.from, form.to),
    errors,
    channels: service.CHANNELS,
    metrics: service.METRICS,
    // Lưới ô số: mỗi brand một bảng, mỗi kênh một hàng, mỗi chỉ số một cột
    brands: BRANDS.map((b, i) => ({
      ...b,
      rows: service.CHANNELS.map((ch) => ({
        ...ch,
        cells: service.METRICS.map((m) => {
          const name = service.statField(i, ch.value, m.value);
          return { name, label: `${m.label} ${ch.label} ${b.label}`, value: form.values[name] ?? '', error: errors[name] };
        }),
      })),
    })),
  };
}

export async function edit(req, res) {
  const date = parseDate(req.query.date);
  res.render('reports/edit', formView(await service.getWeekForm(date)));
}

export async function save(req, res) {
  const date = parseDate(req.body.date);
  const result = await service.saveWeek(date, req.body, req.user.id);
  if (!result.ok) {
    const form = await service.getWeekForm(date);
    return res.status(422).render('reports/edit', formView({ ...form, values: { ...form.values, ...req.body } }, result.errors));
  }
  req.flash('success', 'Đã lưu báo cáo tuần.');
  res.redirect(`/reports?date=${service.weekOf(date).from}`);
}

// ---------------------------------------------------------------- Xuất Excel

const head = (labels) => labels.map((v) => ({ v, s: 'head' }));
const n = (v, s = 'int') => ({ v: v ?? null, s });
const change = (cur, prev) => ({ v: cur != null && prev != null && prev !== 0 ? (cur - prev) / prev : null, s: 'pct' });

/** File Excel 4 trang: Tổng quan · Nội dung · Kênh MXH · Nhận xét. */
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
      if (!t) {
        summary.push([`${p.label}: chưa lấy được số liệu${p.error ? ` — ${p.error}` : ''}`]);
        continue;
      }
      summary.push(
        [`${p.label} — chi tiêu (${p.currency})`, n(t.spend), n(pt?.spend), change(t.spend, pt?.spend)],
        [`${p.label} — kết quả`, n(t.results), n(pt?.results), change(t.results, pt?.results)],
        [`${p.label} — chi phí / kết quả`, n(t.costPerResult), n(pt?.costPerResult), change(t.costPerResult, pt?.costPerResult)],
        [`${p.label} — hiển thị`, n(t.impressions), n(pt?.impressions), change(t.impressions, pt?.impressions)],
        [`${p.label} — CTR`, { v: t.ctr == null ? null : t.ctr / 100, s: 'pct' }, { v: pt?.ctr == null ? null : pt.ctr / 100, s: 'pct' }, change(t.ctr, pt?.ctr)],
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
    [{ v: 'Vấn đề gặp phải', s: 'head' }], [report.notes.issues || '—'], [],
    [{ v: 'Kế hoạch tuần tới', s: 'head' }], [report.notes.next_plan || '—'],
  ];

  return buildXlsx([
    { name: 'Tổng quan', rows: summary, widths: [38, 16, 16, 12] },
    { name: 'Nội dung', rows: contentSheet, widths: [14, 50, 14, 18, 12] },
    { name: 'Kênh MXH', rows: social, widths: [14, 12, 12, 14, 12, 20, 12, 22] },
    { name: 'Nhận xét', rows: notes, widths: [100] },
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
