import { config } from '#config';
import * as service from './ads.service.js';

const nf = (digits = 0) => new Intl.NumberFormat(config.locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const int = nf(0);
const dec = nf(2);

const money = (value, currency) =>
  value == null ? '—' : `${(currency === 'VND' ? int : dec).format(value)} ${currency === 'VND' ? '₫' : currency}`;
const count = (value) => (value == null ? '—' : int.format(value));
const pct = (value) => (value == null ? '—' : `${dec.format(value)}%`);
const times = (value) => (value == null ? '—' : `${dec.format(value)}x`);

// Định dạng sẵn ở đây để view chỉ việc in ra.
function present(row, currency) {
  return {
    ...row,
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
  const maxSpend = Math.max(0, ...p.daily.map((d) => d.spend));
  return {
    ...p,
    totals: present(p.totals, p.currency),
    campaigns: p.campaigns.map((c) => present(c, p.currency)),
    // Cột ngày: chiều cao theo % chi tiêu ngày cao nhất
    daily: p.daily.map((d) => ({
      ...d,
      height: maxSpend ? Math.max(2, Math.round((d.spend / maxSpend) * 100)) : 0,
      tip: `${d.date.split('-').reverse().join('/')}: ${money(d.spend, p.currency)} · ${count(d.results)} kết quả`,
    })),
    accountNames: p.accounts.map((a) => a.name).join(', '),
  };
}

export async function index(req, res) {
  const report = await service.getReport(req.query.range);
  const { combined } = report;
  res.render('ads/index', {
    title: 'Quảng cáo',
    ...report,
    platforms: report.platforms.map(presentPlatform),
    combined: combined && {
      spend: money(combined.spend, combined.currency),
      results: count(combined.results),
      clicks: count(combined.clicks),
      costPerResult: money(combined.costPerResult, combined.currency),
    },
    ranges: service.RANGES,
    refreshSeconds: config.ads.cacheMinutes * 60,
    refreshMinutes: config.ads.cacheMinutes,
  });
}

export async function refresh(req, res) {
  const { range, platforms } = await service.getReport(req.body.range, { force: true });
  const failed = platforms.filter((p) => p.error);
  for (const p of failed) req.flash('error', `${p.label}: không lấy được số liệu mới — ${p.error}`);
  if (!failed.length) req.flash('success', 'Đã cập nhật số liệu mới nhất từ Facebook / TikTok.');
  res.redirect(`/ads?range=${range.key}`); // range.key đã lọc theo danh sách RANGES
}
