// Gọi API Facebook (Meta Marketing API) và TikTok (Business API), đổi kết quả về CÙNG một dạng:
//   { accounts: [{ id, name, currency }], totals, campaigns: [...], daily: [{ date, spend, results }] }
// Mọi số đều là Number. Token gửi qua header (không nằm trên URL, không lộ trong log).
import { config } from '#config';
import { addDays } from '#lib/dates.js';

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Lỗi do API trả về — message hiển thị được cho người xem. */
export class AdsApiError extends Error {
  constructor(platform, message) {
    super(message);
    this.name = 'AdsApiError';
    this.platform = platform;
  }
}

async function fetchJson(platform, url, headers) {
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new AdsApiError(platform, `Không kết nối được tới máy chủ (${err.name === 'TimeoutError' ? 'quá thời gian chờ' : err.message}).`);
  }
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

/** Gom các chỉ số cơ bản thành tổng + các tỷ lệ (CTR, CPC, CPM, chi phí/kết quả). */
export function withRates(row) {
  const { spend, impressions, clicks, results } = row;
  return {
    ...row,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    cpc: clicks ? spend / clicks : null,
    cpm: impressions ? (spend / impressions) * 1000 : null,
    costPerResult: results ? spend / results : null,
    roas: row.revenue && spend ? row.revenue / spend : null,
  };
}

const SUM_KEYS = ['spend', 'impressions', 'reach', 'clicks', 'results', 'messages', 'purchases', 'leads', 'revenue', 'videoViews'];

export function sumRows(rows) {
  const total = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  for (const row of rows) for (const k of SUM_KEYS) total[k] += num(row[k]);
  return withRates(total);
}

/** Cộng dồn theo ngày (nhiều tài khoản cùng ngày -> một dòng). */
function mergeDaily(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const d = byDate.get(r.date) ?? { date: r.date, spend: 0, results: 0, impressions: 0, clicks: 0 };
    d.spend += r.spend;
    d.results += r.results;
    d.impressions += r.impressions;
    d.clicks += r.clicks;
    byDate.set(r.date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- Facebook / Instagram

// "Kết quả" của Facebook = tin nhắn mới + khách tiềm năng + lượt mua (các mục tiêu shop hay chạy).
const META_ACTIONS = {
  messages: ['onsite_conversion.messaging_conversation_started_7d'],
  leads: ['lead', 'onsite_conversion.lead_grouped'],
  purchases: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'],
};

/** Lấy giá trị action đầu tiên có trong danh sách (tránh cộng trùng purchase / omni_purchase). */
function pickAction(actions = [], types) {
  for (const type of types) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return num(hit.value);
  }
  return 0;
}

export function normalizeMetaRow(row) {
  const messages = pickAction(row.actions, META_ACTIONS.messages);
  const leads = pickAction(row.actions, META_ACTIONS.leads);
  const purchases = pickAction(row.actions, META_ACTIONS.purchases);
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    messages,
    leads,
    purchases,
    results: messages + leads + purchases,
    revenue: pickAction(row.action_values, META_ACTIONS.purchases),
    videoViews: 0,
  };
}

async function metaGet(path, params) {
  const { token, apiVersion } = config.ads.meta;
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const rows = [];
  let next = url.toString();
  // Theo trang tối đa 10 lần (5000 dòng) — đủ cho một shop, tránh vòng lặp vô tận.
  for (let page = 0; next && page < 10; page++) {
    const { ok, body } = await fetchJson('meta', next, { Authorization: `Bearer ${token}` });
    if (!ok || body.error) throw new AdsApiError('meta', body.error?.message || 'Facebook từ chối yêu cầu.');
    if (!Array.isArray(body.data)) return body; // gọi thông tin tài khoản: không phải danh sách
    rows.push(...body.data);
    next = body.paging?.next ?? null;
  }
  return rows;
}

const META_FIELDS = 'spend,impressions,reach,clicks,actions,action_values';

/**
 * Trạng thái chiến dịch Facebook -> active | paused | ended | archived | deleted | review | issue.
 * Đang bật nhưng đã quá ngày kết thúc thì tính là "ended".
 */
export function metaCampaignStatus(effectiveStatus, stopTime, now = Date.now()) {
  if (effectiveStatus === 'ACTIVE' && stopTime && Date.parse(stopTime) < now) return 'ended';
  switch (effectiveStatus) {
    case 'ACTIVE':
      return 'active';
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return 'paused';
    case 'ARCHIVED':
      return 'archived';
    case 'DELETED':
      return 'deleted';
    case 'IN_PROCESS':
    case 'PENDING_REVIEW':
    case 'PREAPPROVED':
      return 'review';
    case 'WITH_ISSUES':
    case 'DISAPPROVED':
    case 'PENDING_BILLING_INFO':
      return 'issue';
    default:
      return null;
  }
}

// start_time dạng "2026-10-12T10:00:00+0700" -> lấy phần ngày (đã theo giờ tài khoản quảng cáo).
const metaDay = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

/** Thông tin chiến dịch (trạng thái, ngày bắt đầu/kết thúc). Lỗi thì bỏ qua — chỉ là thông tin phụ. */
async function fetchMetaCampaignInfo(accountId) {
  try {
    const rows = await metaGet(`act_${accountId}/campaigns`, { fields: 'id,effective_status,start_time,stop_time', limit: '500' });
    return new Map(
      (Array.isArray(rows) ? rows : []).map((c) => [
        c.id,
        { status: metaCampaignStatus(c.effective_status, c.stop_time), startDate: metaDay(c.start_time), endDate: metaDay(c.stop_time) },
      ]),
    );
  } catch (err) {
    if (!(err instanceof AdsApiError)) throw err;
    return new Map();
  }
}

async function fetchMetaAccount(accountId, range) {
  // Từ đầu chiến dịch: 'maximum' = toàn bộ thời gian Facebook còn giữ số liệu (tối đa 37 tháng).
  const period = range.lifetime ? { date_preset: 'maximum' } : { time_range: { since: range.from, until: range.to } };
  const [info, campaigns, daily, campaignInfo] = await Promise.all([
    metaGet(`act_${accountId}`, { fields: 'name,currency' }),
    metaGet(`act_${accountId}/insights`, {
      level: 'campaign',
      fields: `campaign_id,campaign_name,${META_FIELDS}`,
      ...period,
      limit: '500',
    }),
    metaGet(`act_${accountId}/insights`, { level: 'account', fields: META_FIELDS, ...period, time_increment: '1', limit: '500' }),
    fetchMetaCampaignInfo(accountId),
  ]);
  const account = { id: accountId, name: info.name || `act_${accountId}`, currency: info.currency || 'VND' };
  return {
    account,
    campaigns: campaigns.map((c) => ({
      id: c.campaign_id,
      name: c.campaign_name,
      account: account.name,
      status: null,
      startDate: null,
      endDate: null,
      ...campaignInfo.get(c.campaign_id),
      ...normalizeMetaRow(c),
    })),
    daily: daily.map((d) => ({ date: d.date_start, ...normalizeMetaRow(d) })),
  };
}

// ---------------------------------------------------------------- TikTok

const TIKTOK_METRICS = ['spend', 'impressions', 'reach', 'clicks', 'conversion', 'video_play_actions'];

export function normalizeTiktokMetrics(m = {}) {
  return {
    spend: num(m.spend),
    impressions: num(m.impressions),
    reach: num(m.reach),
    clicks: num(m.clicks),
    messages: 0,
    leads: 0,
    purchases: 0,
    results: num(m.conversion), // "Chuyển đổi" theo mục tiêu tối ưu của chiến dịch
    revenue: 0,
    videoViews: num(m.video_play_actions),
  };
}

async function tiktokGet(path, params) {
  const url = new URL(`https://business-api.tiktok.com/open_api/v1.3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const { body } = await fetchJson('tiktok', url.toString(), { 'Access-Token': config.ads.tiktok.token });
  if (body.code !== 0) throw new AdsApiError('tiktok', body.message || 'TikTok từ chối yêu cầu.');
  return body.data ?? {};
}

// TikTok giới hạn mỗi lần hỏi theo ngày tối đa 365 ngày -> khoảng dài thì chia nhỏ rồi ghép lại.
const TIKTOK_MAX_DAYS = 365;

export function splitRange(from, to, maxDays = TIKTOK_MAX_DAYS) {
  const parts = [];
  for (let start = from; start <= to; start = addDays(start, maxDays)) {
    const end = addDays(start, maxDays - 1);
    parts.push({ from: start, to: end < to ? end : to });
  }
  return parts;
}

/** period = { lifetime: true } (toàn bộ thời gian, không chia theo ngày) hoặc { from, to }. */
async function tiktokReport(advertiserId, period, extra) {
  const windows = period.lifetime ? [{ query_lifetime: 'true' }] : splitRange(period.from, period.to).map((p) => ({ start_date: p.from, end_date: p.to }));
  const rows = [];
  for (const window of windows) {
    for (let page = 1; page <= 10; page++) {
      const data = await tiktokGet('report/integrated/get/', {
        advertiser_id: advertiserId,
        report_type: 'BASIC',
        ...window,
        page: String(page),
        page_size: '1000',
        ...extra,
      });
      rows.push(...(data.list ?? []));
      if (page >= (data.page_info?.total_page ?? 1)) break;
    }
  }
  return rows;
}

/** Cộng dồn các dòng cùng chiến dịch (khi khoảng ngày bị chia nhỏ). */
function mergeCampaigns(rows) {
  const byId = new Map();
  for (const row of rows) {
    const prev = byId.get(row.id);
    if (!prev) byId.set(row.id, { ...row });
    else for (const k of SUM_KEYS) prev[k] += row[k];
  }
  return [...byId.values()];
}

async function fetchTiktokAccount(advertiserId, range) {
  // Từ đầu chiến dịch: tổng theo chiến dịch lấy trọn đời (query_lifetime); TikTok không cho chia theo ngày
  // khi lấy trọn đời nên biểu đồ chỉ vẽ 365 ngày gần nhất.
  const dailyPeriod = range.lifetime ? { from: addDays(range.to, -(TIKTOK_MAX_DAYS - 1)), to: range.to } : range;
  const [info, campaigns, daily] = await Promise.all([
    tiktokGet('advertiser/info/', { advertiser_ids: [advertiserId], fields: ['name', 'currency'] }),
    tiktokReport(advertiserId, range, {
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id'],
      metrics: [...TIKTOK_METRICS, 'campaign_name'],
    }),
    tiktokReport(advertiserId, dailyPeriod, { data_level: 'AUCTION_ADVERTISER', dimensions: ['stat_time_day'], metrics: TIKTOK_METRICS }),
  ]);
  const meta = info.list?.[0] ?? {};
  const account = { id: advertiserId, name: meta.name || advertiserId, currency: meta.currency || 'VND' };
  return {
    account,
    campaigns: mergeCampaigns(
      campaigns.map((r) => ({
        id: r.dimensions?.campaign_id,
        name: r.metrics?.campaign_name || r.dimensions?.campaign_id,
        account: account.name,
        status: null,
        startDate: null,
        endDate: null,
        ...normalizeTiktokMetrics(r.metrics),
      })),
    ),
    // stat_time_day dạng "2026-11-10 00:00:00"
    daily: daily.map((r) => ({ date: String(r.dimensions?.stat_time_day ?? '').slice(0, 10), ...normalizeTiktokMetrics(r.metrics) })),
  };
}

// ---------------------------------------------------------------- Dùng chung

export const PLATFORMS = {
  meta: {
    key: 'meta',
    label: 'Facebook & Instagram',
    resultLabel: 'Tin nhắn · Khách tiềm năng · Mua hàng',
    isConfigured: () => Boolean(config.ads.meta.token && config.ads.meta.accountIds.length),
    accountIds: () => config.ads.meta.accountIds,
    fetchAccount: fetchMetaAccount,
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    resultLabel: 'Chuyển đổi',
    isConfigured: () => Boolean(config.ads.tiktok.token && config.ads.tiktok.advertiserIds.length),
    accountIds: () => config.ads.tiktok.advertiserIds,
    fetchAccount: fetchTiktokAccount,
  },
};

/** Lấy & gộp mọi tài khoản của một nền tảng trong khoảng ngày. */
export async function fetchPlatform(key, range) {
  const platform = PLATFORMS[key];
  const parts = await Promise.all(platform.accountIds().map((id) => platform.fetchAccount(id, range)));
  const campaigns = parts
    .flatMap((p) => p.campaigns)
    .filter((c) => c.spend > 0 || c.impressions > 0)
    .map(withRates)
    .sort((a, b) => b.spend - a.spend);
  return {
    accounts: parts.map((p) => p.account),
    currency: parts[0]?.account.currency ?? 'VND',
    totals: sumRows(campaigns),
    campaigns,
    daily: mergeDaily(parts.flatMap((p) => p.daily)),
  };
}
