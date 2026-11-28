// Báo cáo tuần — chỉ số kênh mạng xã hội lấy thẳng từ nền tảng (cấu hình SOCIAL_ACCOUNTS, xem .env.example).
// Mỗi tài khoản trả { followers, views, engagements } (số hoặc null khi nền tảng không có / lỗi):
//   - Facebook Trang: followers_count; lượt xem = page_media_view (thay page_impressions đã bỏ 15/11/2025),
//     tương tác = page_post_engagements (cộng theo ngày).
//   - Instagram doanh nghiệp: followers_count; views + total_interactions (metric_type=total_value).
//   - TikTok doanh nghiệp (Business API /business/get/): followers_count ngày cuối, video_views, likes+comments+shares.
//   - YouTube: chỉ số người đăng ký (lượt xem theo tuần cần YouTube Analytics + đăng nhập Google — chưa làm).
// Follower là số HIỆN TẠI -> chỉ điền cho tuần đang diễn ra; tuần đã qua dùng số đã lưu.
// Mỗi chỉ số gọi riêng: một chỉ số lỗi (thiếu quyền, nền tảng đổi API) không làm mất các chỉ số khác.
// Lưu tạm như trang Quảng cáo (bảng ads_cache, khoá "social:…") để không gọi API mỗi lần mở trang.
import { config } from '#config';
import { addDays } from '#lib/dates.js';
import * as cacheRepo from '#modules/ads/ads.repo.js';

const META = 'https://graph.facebook.com';
const TIKTOK = 'https://business-api.tiktok.com/open_api/v1.3';
const YOUTUBE = 'https://www.googleapis.com/youtube/v3';

const toNumber = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const sum = (values) => {
  const nums = values.map(toNumber).filter((n) => n != null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
};

/** GET JSON; lỗi mạng / HTTP / API -> null (ghi cảnh báo, không ném lỗi). */
async function getJson(label, url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    const apiError = body.error?.message ?? (body.code && body.code !== 0 ? body.message : null);
    if (!res.ok || apiError) {
      console.warn(`[social] ${label}: ${apiError ?? `HTTP ${res.status}`}`);
      return null;
    }
    return body;
  } catch (err) {
    console.warn(`[social] ${label}: ${err.message}`);
    return null;
  }
}

const metaUrl = (path, params) =>
  `${META}/${config.ads.meta.apiVersion}/${path.split('/').map(encodeURIComponent).join('/')}?${new URLSearchParams(params)}`;
const metaHeaders = () => ({ Authorization: `Bearer ${config.social.metaToken}` });
const unix = (isoDate) => Math.floor(Date.parse(`${isoDate}T00:00:00+07:00`) / 1000);

async function facebook(id, { from, to }) {
  const range = { period: 'day', since: unix(from), until: unix(addDays(to, 1)) };
  const [page, views, engagements] = await Promise.all([
    getJson('facebook', metaUrl(id, { fields: 'followers_count' }), metaHeaders()),
    getJson('facebook views', metaUrl(`${id}/insights`, { metric: 'page_media_view', ...range }), metaHeaders()),
    getJson('facebook engagements', metaUrl(`${id}/insights`, { metric: 'page_post_engagements', ...range }), metaHeaders()),
  ]);
  const total = (body) => sum(body?.data?.[0]?.values?.map((v) => v.value) ?? []);
  return { followers: toNumber(page?.followers_count), views: total(views), engagements: total(engagements) };
}

async function instagram(id, { from, to }) {
  const range = { period: 'day', metric_type: 'total_value', since: unix(from), until: unix(addDays(to, 1)) };
  const [user, insights] = await Promise.all([
    getJson('instagram', metaUrl(id, { fields: 'followers_count' }), metaHeaders()),
    getJson('instagram insights', metaUrl(`${id}/insights`, { metric: 'views,total_interactions', ...range }), metaHeaders()),
  ]);
  const metric = (name) => toNumber(insights?.data?.find((m) => m.name === name)?.total_value?.value);
  return { followers: toNumber(user?.followers_count), views: metric('views'), engagements: metric('total_interactions') };
}

async function tiktok(id, { from, to }) {
  const params = new URLSearchParams({
    business_id: id,
    start_date: from,
    end_date: to,
    fields: JSON.stringify(['followers_count', 'video_views', 'likes', 'comments', 'shares']),
  });
  const body = await getJson('tiktok', `${TIKTOK}/business/get/?${params}`, { 'Access-Token': config.social.tiktokToken });
  const days = (body?.data?.metrics ?? []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!days.length) return { followers: null, views: null, engagements: null };
  return {
    followers: toNumber(days.findLast((d) => d.followers_count != null)?.followers_count),
    views: sum(days.map((d) => d.video_views)),
    engagements: sum(days.flatMap((d) => [d.likes, d.comments, d.shares])),
  };
}

async function youtube(id) {
  // Google bắt buộc API key nằm trên URL (key chỉ đọc dữ liệu công khai)
  const params = new URLSearchParams({ part: 'statistics', id, key: config.social.youtubeKey });
  const body = await getJson('youtube', `${YOUTUBE}/channels?${params}`);
  return { followers: toNumber(body?.items?.[0]?.statistics?.subscriberCount), views: null, engagements: null };
}

const PROVIDERS = {
  facebook: { fetch: facebook, ready: () => Boolean(config.social.metaToken) },
  instagram: { fetch: instagram, ready: () => Boolean(config.social.metaToken) },
  tiktok: { fetch: tiktok, ready: () => Boolean(config.social.tiktokToken) },
  youtube: { fetch: youtube, ready: () => Boolean(config.social.youtubeKey) },
};

/** Tài khoản đã cấu hình và có token cho nền tảng đó. */
export const connectedAccounts = () => config.social.accounts.filter((a) => PROVIDERS[a.channel]?.ready());

const ageMinutes = (fetchedAt) => (Date.now() - Date.parse(`${fetchedAt.replace(' ', 'T')}Z`)) / 60_000;

async function fetchAccount(account, range) {
  const key = `social:${account.channel}:${account.id}:${range.from}:${range.to}`;
  const cached = await cacheRepo.findCache(key);
  if (cached && ageMinutes(cached.fetched_at) < config.ads.cacheMinutes) return JSON.parse(cached.payload);
  const data = await PROVIDERS[account.channel].fetch(account.id, range);
  if (data.followers != null || data.views != null || data.engagements != null) await cacheRepo.saveCache(key, data);
  else if (cached) return JSON.parse(cached.payload); // lần này lỗi hết -> dùng bản lưu cũ
  return data;
}

/**
 * Số tự lấy cho tuần [from, to]: [{ brand, channel, followers, views, engagements }].
 * Tuần chưa bắt đầu -> []. Tuần đang diễn ra tính tới hôm nay; follower chỉ điền cho tuần đang diễn ra.
 */
export async function fetchWeek({ from, to }, today) {
  if (from > today) return [];
  const range = { from, to: to > today ? today : to };
  const isCurrent = to >= today;
  const accounts = connectedAccounts();
  const results = await Promise.all(accounts.map((a) => fetchAccount(a, range)));
  return accounts.map((a, i) => ({
    brand: a.brand,
    channel: a.channel,
    ...results[i],
    followers: isCurrent ? results[i].followers : null,
  }));
}

/**
 * Gộp số đã nhập tay với số tự lấy: ô nào đã nhập thì giữ số đã nhập, ô trống thì dùng số tự lấy.
 * autoFields ghi những chỉ số lấy tự động (để giao diện ghi chú "tự lấy").
 */
export function mergeStats(saved, auto) {
  const key = (s) => `${s.brand}|${s.channel}`;
  const map = new Map(saved.map((s) => [key(s), { ...s, autoFields: [] }]));
  for (const a of auto) {
    const row = map.get(key(a)) ?? { brand: a.brand, channel: a.channel, followers: null, views: null, engagements: null, autoFields: [] };
    for (const m of ['followers', 'views', 'engagements']) {
      if (row[m] == null && a[m] != null) {
        row[m] = a[m];
        row.autoFields.push(m);
      }
    }
    map.set(key(a), row);
  }
  return [...map.values()].filter((r) => r.followers != null || r.views != null || r.engagements != null);
}
