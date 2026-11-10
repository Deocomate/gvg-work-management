// Nhập dữ liệu một lần từ Google Sheet "Idea bank - Gốm Vũ Gia, Klayy & GSXD" (tab Plan + Idea bank).
// Dữ liệu đã chép sẵn trong sheet-import.json. Chỉ quản lý; bấm lại không bị trùng (cùng tên + ngày đăng thì bỏ qua).
// Nhập lại: nội dung đã có chỉ được bổ sung link tham khảo / link kịch bản còn thiếu (ô đang trống hoặc mới là chữ),
// kịch bản viết sẵn (chữ) chỉ điền khi ô kịch bản đang trống; không đụng các trường khác để giữ những gì đã sửa trong app.
import { readFile } from 'node:fs/promises';
import { forbidden } from '#lib/errors.js';
import { foldText } from '#lib/text.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import { staffOptions } from '#modules/staff/staff.service.js';
import * as repo from './plan.repo.js';
import { syncPlans } from './plan.sync.js';

const SHEET_STATUS = {
  'mới': 'idea',
  'đã chọn': 'selected',
  // Sheet cũ có nhiều bước hơn: các bước giữa gộp vào "Đã chọn".
  'đã viết kịch bản': 'selected',
  'đã lên lịch': 'selected',
  'đã quay': 'selected',
  'đã đăng': 'posted',
  'đã xong': 'posted',
  'bỏ': 'dropped',
};
const SHEET_FIELDS = [
  'title', 'description', 'reference_url', 'topic', 'brand', 'video_type', 'script',
  'shoot_date', 'post_date', 'shoot_time', 'location', 'props', 'note',
];
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v ?? '');
// Dòng ghi chú chứa link phụ (VD "Tham khảo thêm: https://…") cũng được bổ sung khi nhập lại.
const linkLines = (note) => (note ?? '').split('\n').filter((line) => line.startsWith('Tham khảo thêm') && /https?:\/\//.test(line));

/** Nội dung đã có: điền link từ Sheet vào ô trống hoặc ô chỉ có chữ. Trả về true nếu có thay đổi. */
async function fillLinks(data) {
  const current = await repo.findImported(data);
  if (!current) return false;
  const next = { ...current };
  for (const field of ['reference_url', 'script']) {
    if (isUrl(data[field]) && !isUrl(current[field])) next[field] = data[field];
  }
  // Kịch bản viết sẵn (chữ) chỉ điền vào ô đang trống, không đè lên kịch bản đã gõ trong app.
  if (data.script && !isUrl(data.script) && !clean(current.script)) next.script = data.script;
  const extra = linkLines(data.note).filter((line) => !(current.note ?? '').includes(line));
  if (extra.length) next.note = [current.note, ...extra].filter(Boolean).join('\n');
  const changed = ['reference_url', 'script', 'note'].some((f) => next[f] !== current[f]);
  if (changed) await repo.updateLinks(current.id, next);
  return changed;
}

/** Tên trong Sheet (VD "Nhài") -> tài khoản trong app: khớp cả họ tên hoặc tên gọi (chữ cuối), không phân biệt dấu. */
function nameMatcher(staff) {
  const people = staff.map((s) => {
    const full = foldText(s.label);
    return { id: s.value, full, last: full.split(/\s+/).at(-1) };
  });
  return (name) => {
    const n = foldText(name);
    if (!n) return null;
    return (people.find((p) => p.full === n) ?? people.find((p) => p.last === n))?.id ?? null;
  };
}

export async function importFromSheet(user) {
  if (!isManager(user)) throw forbidden('Chỉ quản lý mới nhập được dữ liệu từ Sheet.');
  const sheet = JSON.parse(await readFile(new URL('./sheet-import.json', import.meta.url), 'utf8'));
  const userOf = nameMatcher(await staffOptions());
  const rows = [
    ...sheet.plan.map((r) => ({ ...r, defaultStatus: 'selected' })),
    ...sheet.ideas.map((r) => ({ ...r, defaultStatus: 'idea' })),
  ];

  const unknown = new Set();
  const addedIds = [];
  let updated = 0;
  for (const r of rows) {
    const data = Object.fromEntries(SHEET_FIELDS.map((f) => [f, clean(r[f])]));
    if (!data.title) continue;
    if (await repo.exists(data)) {
      if (await fillLinks(data)) updated += 1;
      continue;
    }
    data.platform = 'tiktok';
    data.status = SHEET_STATUS[clean(r.status)?.toLowerCase()] ?? r.defaultStatus;
    data.owner_id = userOf(r.owner);
    data.proposer_id = userOf(r.proposer);
    data.writer_id = userOf(r.writer);
    // Người chưa có tài khoản trong app: ghi tên vào ghi chú để không mất thông tin.
    const missing = [['Phụ trách', r.owner], ['Người góp', r.proposer], ['Viết kịch bản', r.writer]]
      .filter(([, name]) => clean(name) && !userOf(name))
      .map(([label, name]) => (unknown.add(name.trim()), `${label}: ${name.trim()}`));
    if (missing.length) data.note = [data.note, `(Từ Sheet — ${missing.join(', ')})`].filter(Boolean).join('\n');
    const plan = await repo.create(data, user.id, r.date ? `${r.date} 00:00:00` : null);
    addedIds.push(plan.id);
  }
  await syncPlans(addedIds); // đưa việc quay/đăng lên lịch làm việc của người phụ trách
  return { added: addedIds.length, updated, skipped: rows.length - addedIds.length - updated, unknown: [...unknown] };
}
