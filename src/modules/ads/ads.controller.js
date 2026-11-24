import { config } from '#config';
import { formatDayVN, todayISO } from '#lib/dates.js';
import { buildXlsx } from '#lib/xlsx.js';
import * as service from './ads.service.js';

const nf = (digits = 0) => new Intl.NumberFormat(config.locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const int = nf(0);
const dec = nf(2);

const money = (value, currency) =>
  value == null ? '—' : `${(currency === 'VND' ? int : dec).format(value)} ${currency === 'VND' ? '₫' : currency}`;
const count = (value) => (value == null ? '—' : int.format(value));
const pct = (value) => (value == null ? '—' : `${dec.format(value)}%`);
const times = (value) => (value == null ? '—' : `${dec.format(value)}x`);

// Trạng thái chiến dịch (ads.providers.js) -> chữ + class nhãn màu
const STATUS = {
  active: { label: 'Đang chạy', badge: 'badge-green' },
  paused: { label: 'Tạm dừng', badge: 'badge-gray' },
  ended: { label: 'Đã kết thúc', badge: 'badge-gray' },
  archived: { label: 'Lưu trữ', badge: 'badge-gray' },
  deleted: { label: 'Đã xoá', badge: 'badge-gray' },
  review: { label: 'Đang duyệt', badge: 'badge-yellow' },
  issue: { label: 'Có lỗi', badge: 'badge-red' },
};

// Khoảng dài hơn 2 tháng: biểu đồ gom theo tháng cho dễ nhìn (vài trăm cột ngày thì không đọc được).
const MONTHLY_AFTER_DAYS = 62;

function groupByMonth(daily) {
  const byMonth = new Map();
  for (const d of daily) {
    const key = d.date.slice(0, 7);
    const m = byMonth.get(key) ?? { date: `${key}-01`, month: key, spend: 0, results: 0 };
    m.spend += d.spend;
    m.results += d.results;
    byMonth.set(key, m);
  }
  return [...byMonth.values()];
}

// Định dạng sẵn ở đây để view chỉ việc in ra.
function present(row, currency) {
  return {
    ...row,
    statusInfo: STATUS[row.status] ?? null,
    f: {
      spend: money(row.spend, currency),
      impressions: count(row.impressions),
      reach: count(row.reach),
      clicks: count(row.clicks),
      results: count(row.results),
      messages: count(row.messages),
      purchases: count(row.purchases),
      leads: count(row.leads),
      videoViews: count(row.videoViews),
      revenue: money(row.revenue, currency),
      ctr: pct(row.ctr),
      cpc: money(row.cpc, currency),
      cpm: money(row.cpm, currency),
      costPerResult: money(row.costPerResult, currency),
      roas: times(row.roas),
    },
  };
}

function presentPlatform(p) {
  if (!p.totals) return p;
  // Bỏ những ngày đầu chưa tiêu đồng nào (Từ đầu chiến dịch trả về cả thời gian trước khi chạy).
  const firstSpend = p.daily.findIndex((d) => d.spend > 0);
  const days = firstSpend < 0 ? [] : p.daily.slice(firstSpend);
  const monthly = days.length > MONTHLY_AFTER_DAYS;
  const bars = monthly ? groupByMonth(days) : days;
  const maxSpend = Math.max(0, ...bars.map((d) => d.spend));
  return {
    ...p,
    totals: present(p.totals, p.currency),
    campaigns: p.campaigns.map((c) => present(c, p.currency)),
    chartTitle: monthly ? 'Chi tiêu theo tháng' : 'Chi tiêu theo ngày',
    // Cột: chiều cao theo % chi tiêu cao nhất
    daily: bars.map((d) => ({
      ...d,
      height: maxSpend ? Math.max(2, Math.round((d.spend / maxSpend) * 100)) : 0,
      tip: `${monthly ? d.month.split('-').reverse().join('/') : formatDayVN(d.date)}: ${money(d.spend, p.currency)} · ${count(d.results)} kết quả`,
    })),
    accountNames: p.accounts.map((a) => a.name).join(', '),
  };
}

const customOf = (source) => ({ from: source.from, to: source.to });

/** Dòng mô tả khoảng ngày cho tiêu đề trang và file xuất. */
function rangeLabel(range) {
  if (range.lifetime) {
    return range.from ? `Từ đầu chiến dịch (${formatDayVN(range.from)}) – ${formatDayVN(range.to)}` : 'Từ đầu chiến dịch';
  }
  return range.from === range.to ? formatDayVN(range.from) : `${formatDayVN(range.from)} – ${formatDayVN(range.to)}`;
}

export async function index(req, res) {
  const report = await service.getReport(req.query.range, { custom: customOf(req.query) });
  const { combined, range } = report;
  const query = service.rangeQuery(range);
  res.render('ads/index', {
    title: 'Quảng cáo',
    ...report,
    rangeText: rangeLabel(range),
    rangeQuery: query,
    exportFilename: `bao-cao-quang-cao-${range.lifetime ? 'tu-dau' : `${range.from}-${range.to}`}`,
    platforms: report.platforms.map(presentPlatform),
    combined: combined && {
      spend: money(combined.spend, combined.currency),
      results: count(combined.results),
      clicks: count(combined.clicks),
      costPerResult: money(combined.costPerResult, combined.currency),
    },
    ranges: service.RANGES,
    // Ô ngày tự chọn: điền sẵn khoảng đang xem
    customFrom: range.from ?? range.to,
    customTo: range.to,
    today: todayISO(),
    refreshSeconds: config.ads.cacheMinutes * 60,
    refreshMinutes: config.ads.cacheMinutes,
  });
}

export async function refresh(req, res) {
  const { range, platforms } = await service.getReport(req.body.range, { force: true, custom: customOf(req.body) });
  const failed = platforms.filter((p) => p.error);
  for (const p of failed) req.flash('error', `${p.label}: không lấy được số liệu mới — ${p.error}`);
  if (!failed.length) req.flash('success', 'Đã cập nhật số liệu mới nhất từ Facebook / TikTok.');
  res.redirect(`/ads?${service.rangeQuery(range)}`); // rangeQuery chỉ chứa giá trị đã lọc
}

// ---------------------------------------------------------------- Xuất Excel

const n = (v, s = 'int') => ({ v: v ?? null, s });
const ratio = (percent) => ({ v: percent == null ? null : percent / 100, s: 'pct' });
const head = (labels) => labels.map((v) => ({ v, s: 'head' }));

const CAMPAIGN_HEAD = [
  'Nền tảng', 'Tài khoản', 'Chiến dịch', 'Trạng thái', 'Bắt đầu', 'Kết thúc',
  'Chi tiêu', 'Kết quả', 'Chi phí / kết quả', 'Tin nhắn mới', 'Khách tiềm năng', 'Lượt mua',
  'Hiển thị', 'Tiếp cận', 'Lượt nhấp', 'CTR', 'CPC', 'CPM', 'Doanh thu (pixel)', 'ROAS', 'Lượt xem video',
];

function metricCells(row) {
  return [
    n(row.spend), n(row.results), n(row.costPerResult), n(row.messages), n(row.leads), n(row.purchases),
    n(row.impressions), n(row.reach), n(row.clicks), ratio(row.ctr), n(row.cpc), n(row.cpm),
    n(row.revenue), n(row.roas, 'dec'), n(row.videoViews),
  ];
}

/** Báo cáo 3 trang: Tổng quan · Theo chiến dịch · Theo ngày. */
export function buildReportWorkbook({ range, platforms }, now = new Date()) {
  const withData = platforms.filter((p) => p.totals);
  const exportedAt = new Intl.DateTimeFormat(config.locale, { dateStyle: 'short', timeStyle: 'short', timeZone: config.timezone }).format(now);
  const intro = [
    [{ v: 'Báo cáo kết quả quảng cáo', s: 'title' }],
    [`Khoảng thời gian: ${rangeLabel(range)}`],
    [`Xuất lúc: ${exportedAt}`],
    [],
  ];

  const summary = [
    ...intro,
    head(['Nền tảng', 'Tài khoản', 'Tiền tệ', 'Số chiến dịch', 'Đang chạy', ...CAMPAIGN_HEAD.slice(6)]),
    ...withData.map((p) => [
      p.label,
      p.accounts.map((a) => a.name).join(', '),
      p.currency,
      n(p.campaigns.length),
      n(p.campaigns.filter((c) => c.status === 'active').length),
      ...metricCells(p.totals),
    ]),
  ];
  for (const p of platforms) {
    if (!p.configured) summary.push([p.label, 'Chưa kết nối']);
    else if (p.error) summary.push([p.label, `Lỗi lấy số liệu: ${p.error}${p.totals ? ' (đang dùng bản lưu gần nhất)' : ''}`]);
  }
  summary.push([], ['Kết quả Facebook = tin nhắn mới + khách tiềm năng + lượt mua. Kết quả TikTok = chuyển đổi theo mục tiêu tối ưu.']);

  const campaigns = [
    ...intro,
    head(CAMPAIGN_HEAD),
    ...withData.flatMap((p) =>
      p.campaigns.map((c) => [
        p.label,
        c.account,
        c.name,
        STATUS[c.status]?.label ?? '',
        formatDayVN(c.startDate),
        formatDayVN(c.endDate),
        ...metricCells(c),
      ]),
    ),
  ];

  const daily = [
    ...intro,
    head(['Ngày', 'Nền tảng', 'Chi tiêu', 'Kết quả', 'Hiển thị', 'Lượt nhấp']),
    ...withData.flatMap((p) =>
      p.daily
        .filter((d) => d.spend > 0 || d.results > 0)
        .map((d) => [formatDayVN(d.date), p.label, n(d.spend), n(d.results), n(d.impressions), n(d.clicks)]),
    ),
  ];

  return buildXlsx([
    { name: 'Tổng quan', rows: summary, widths: [22, 24, 9, 13, 10, 15, 10, 15, 12, 14, 10, 13, 12, 11, 8, 10, 11, 15, 8, 13] },
    { name: 'Theo chiến dịch', rows: campaigns, widths: [20, 18, 42, 12, 11, 11, 15, 10, 15, 12, 14, 10, 13, 12, 11, 8, 10, 11, 15, 8, 13] },
    { name: 'Theo ngày', rows: daily, widths: [12, 20, 15, 10, 13, 11] },
  ]);
}

export async function exportXlsx(req, res) {
  const report = await service.getReport(req.query.range, { custom: customOf(req.query) });
  const { range } = report;
  const filename = `bao-cao-quang-cao-${range.lifetime ? 'tu-dau' : `${range.from}_${range.to}`}.xlsx`;
  res
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .attachment(filename)
    .send(buildReportWorkbook(report));
}
