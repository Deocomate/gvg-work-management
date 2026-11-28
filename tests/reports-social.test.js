// Báo cáo tuần — chỉ số kênh MXH tự lấy từ Facebook / Instagram / TikTok / YouTube (giả lập fetch, không gọi API thật).
process.env.SOCIAL_ACCOUNTS = 'Vũ Gia:facebook:111,Vũ Gia:instagram:222,Klayy:tiktok:biz-333,GSXD:youtube:UC444';
process.env.META_PAGE_ACCESS_TOKEN = 'meta-page-token';
process.env.TIKTOK_BUSINESS_ACCESS_TOKEN = 'tiktok-biz-token';
process.env.YOUTUBE_API_KEY = 'yt-key';

// import thường chạy TRƯỚC các dòng trên -> nạp app bằng import động để config đọc được env.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { setup, postForm } = await import('./helpers.js');
const { loginAsAdmin } = await import('./auth-helpers.js');
const { todayISO, weekDays, addDays } = await import('../src/lib/dates.js');
const { mergeStats } = await import('../src/modules/reports/reports.social.js');

const calls = [];
let failInstagram = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  calls.push({ url, headers: init.headers ?? {} });
  const p = url.pathname;
  if (url.hostname === 'graph.facebook.com') {
    if (p.endsWith('/111')) return json({ followers_count: 5200 });
    if (p.endsWith('/111/insights') && url.searchParams.get('metric') === 'page_media_view') return json({ data: [{ values: [{ value: 100 }, { value: 250 }] }] });
    if (p.endsWith('/111/insights')) return json({ data: [{ values: [{ value: 7 }, { value: 8 }] }] });
    if (failInstagram) return json({ error: { message: 'Thiếu quyền instagram_manage_insights' } }, 400);
    if (p.endsWith('/222')) return json({ followers_count: 3100 });
    if (p.endsWith('/222/insights')) return json({ data: [{ name: 'views', total_value: { value: 9000 } }, { name: 'total_interactions', total_value: { value: 420 } }] });
  }
  if (url.hostname === 'business-api.tiktok.com') {
    return json({ code: 0, data: { metrics: [
      { date: '2026-11-24', followers_count: 800, video_views: 1000, likes: 50, comments: 5, shares: 2 },
      { date: '2026-11-25', followers_count: 820, video_views: 1500, likes: 70, comments: 3, shares: 1 },
    ] } });
  }
  if (url.hostname === 'www.googleapis.com') return json({ items: [{ statistics: { subscriberCount: '1234' } }] });
  return json({ error: { message: 'không giả lập' } }, 404);
};

const monday = weekDays(todayISO())[0];
const { agent: admin } = await setup();
await loginAsAdmin(admin);

test('tuần này: form điền sẵn số từ các nền tảng, token gửi qua header', async () => {
  const form = (await admin.get(`/reports/edit?date=${monday}`)).text;
  const value = (name) => form.match(new RegExp(`name="${name}" value="([^"]*)"`))[1];
  // Vũ Gia = brand 0, Klayy = 1, GSXD = 2
  assert.equal(value('s_0_facebook_followers'), '5200');
  assert.equal(value('s_0_facebook_views'), '350');
  assert.equal(value('s_0_facebook_engagements'), '15');
  assert.equal(value('s_0_instagram_views'), '9000');
  assert.equal(value('s_1_tiktok_followers'), '820');
  assert.equal(value('s_1_tiktok_views'), '2500');
  assert.equal(value('s_1_tiktok_engagements'), '131');
  assert.equal(value('s_2_youtube_followers'), '1234');
  assert.equal(value('s_2_youtube_views'), '');
  assert.match(form, /Tự lấy từ nền tảng/);

  const fb = calls.find((c) => c.url.hostname === 'graph.facebook.com');
  assert.equal(fb.headers.Authorization, 'Bearer meta-page-token');
  assert.ok(!fb.url.search.includes('meta-page-token'));
  assert.equal(calls.find((c) => c.url.hostname === 'business-api.tiktok.com').headers['Access-Token'], 'tiktok-biz-token');
});

test('báo cáo hiện số tự lấy; số đã nhập tay được ưu tiên', async () => {
  let page = (await admin.get(`/reports?date=${monday}`)).text;
  assert.match(page, /5\.200/);
  assert.match(page, /tự lấy/);

  await postForm(admin, '/reports', { date: monday, s_0_facebook_followers: '6000' }, { from: '/reports/edit' });
  page = (await admin.get(`/reports?date=${monday}`)).text;
  assert.match(page, /6\.000/);
  assert.doesNotMatch(page, /5\.200/);
});

test('tuần đã qua không lấy follower hiện tại; tuần chưa tới không gọi API', async () => {
  const before = calls.length;
  await admin.get(`/reports/edit?date=${addDays(monday, 14)}`);
  assert.equal(calls.length, before);

  const past = (await admin.get(`/reports/edit?date=${addDays(monday, -21)}`)).text;
  assert.match(past, /name="s_0_facebook_followers" value=""/);
  assert.match(past, /name="s_0_facebook_views" value="350"/);
});

test('một nền tảng lỗi vẫn giữ các nền tảng khác', async () => {
  failInstagram = true;
  const form = (await admin.get(`/reports/edit?date=${addDays(monday, -35)}`)).text;
  assert.match(form, /name="s_0_instagram_views" value=""/);
  assert.match(form, /name="s_0_facebook_views" value="350"/);
  failInstagram = false;
});

test('mergeStats: ô đã nhập giữ nguyên, ô trống lấy số tự động', () => {
  const rows = mergeStats(
    [{ brand: 'Vũ Gia', channel: 'facebook', followers: 10, views: null, engagements: null }],
    [{ brand: 'Vũ Gia', channel: 'facebook', followers: 99, views: 5, engagements: null }, { brand: 'Klayy', channel: 'tiktok', followers: null, views: null, engagements: null }],
  );
  assert.deepEqual(rows, [{ brand: 'Vũ Gia', channel: 'facebook', followers: 10, views: 5, engagements: null, autoFields: ['views'] }]);
});
