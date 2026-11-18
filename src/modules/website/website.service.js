// Checklist launch website (tab "Up website" trên Lịch làm việc): mỗi site một bảng các trang,
// mỗi trang có sản phẩm / dự án cần up và việc cần hoàn thiện; tiến độ = số mục đã tick / tổng số mục.
// Ai đăng nhập cũng tick, thêm mục, thêm trang được; xoá trang: quản lý hoặc người tạo trang đó.
import { forbidden, notFound } from '#lib/errors.js';
import { todayISO } from '#lib/dates.js';
import { validate } from '#lib/validate.js';
import { isManager } from '#modules/tasks/tasks.service.js';
import * as repo from './website.repo.js';
import { CATEGORIES, PAGE_STATUSES, SITES, itemSchema, newPageSchema, pageSchema } from './website.schema.js';

const SITE = Object.fromEntries(SITES.map((s) => [s.value, s]));
const STATUS = Object.fromEntries(PAGE_STATUSES.map((s) => [s.value, s]));
export const parseSite = (value) => SITE[value] ?? SITES[0];
const percent = (done, total) => (total ? Math.round((done / total) * 100) : 0);
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const isProject = (page) => page.category.startsWith('Dự án');
// Trang Dự án: "đã up ảnh x/y dự án"; trang khác: "đã up x/y sản phẩm".
const itemLabel = (page) =>
  isProject(page) ? { unit: 'dự án', verb: 'Đã up ảnh', add: '+ Thêm dự án…' } : { unit: 'sản phẩm', verb: 'Đã up', add: '+ Thêm sản phẩm…' };
const groupBy = (list, key) => list.reduce((map, x) => map.set(key(x), [...(map.get(key(x)) ?? []), x]), new Map());

function decoratePage(p, items, site, user, today) {
  const products = items.filter((i) => i.kind === 'item');
  const todos = items.filter((i) => i.kind === 'todo');
  const done = items.filter((i) => i.done).length;
  const productsDone = products.filter((i) => i.done).length;
  return {
    ...p,
    url: p.path ? site.url + p.path : null,
    statusInfo: STATUS[p.status] ?? STATUS.thieu,
    // Sản phẩm / dự án chia nhóm (VD "Đền, chùa", "Nhà hàng"): dòng đầu mỗi nhóm mang tên nhóm để in tiêu đề
    products: products.map((it, i) => ({ ...it, groupStart: it.grp && it.grp !== products[i - 1]?.grp ? it.grp : null })),
    todos,
    total: items.length,
    done,
    percent: percent(done, items.length),
    productsDone,
    productsPercent: percent(productsDone, products.length),
    label: itemLabel(p),
    deadlineDM: ddmm(p.deadline),
    isLate: Boolean(p.deadline) && p.deadline < today && done < items.length,
    canDelete: isManager(user) || p.created_by === user.id,
  };
}

/** Dữ liệu tab Up website: các trang của site (lọc danh mục, chưa xong / đã xong 100%) + tiến độ cho cột bên phải. */
export async function getChecklist({ site, category = '', state = '' }, user) {
  const info = parseSite(site);
  const today = todayISO();
  const [pages, items, progress] = await Promise.all([repo.listPages(info.value), repo.listItems(info.value), repo.siteProgress()]);
  const byPage = groupBy(items, (i) => i.page_id);
  const rows = pages.map((p) => decoratePage(p, byPage.get(p.id) ?? [], info, user, today));

  const categories = [...new Set([...CATEGORIES, ...rows.map((r) => r.category)])];
  const filters = { category: categories.includes(category) ? category : '', state: ['done', 'todo'].includes(state) ? state : '' };
  const shown = rows.filter(
    (r) =>
      (!filters.category || r.category === filters.category) &&
      (filters.state === 'done' ? r.total > 0 && r.percent === 100 : filters.state === 'todo' ? r.percent < 100 : true),
  );
  const sum = (list, fn) => list.reduce((n, r) => n + fn(r), 0);
  const pctOf = (list) => percent(sum(list, (r) => r.done), sum(list, (r) => r.total));
  const withProducts = rows.filter((r) => r.products.length);
  const countOf = (list) => ({ done: sum(list, (r) => r.productsDone), total: sum(list, (r) => r.products.length) });

  return {
    site: info,
    sites: SITES.map((s) => {
      const p = progress.find((x) => x.site === s.value);
      return { ...s, active: s.value === info.value, percent: percent(Number(p?.done ?? 0), Number(p?.total ?? 0)) };
    }),
    pages: shown.map((r, i) => ({ ...r, stt: i + 1 })),
    filters,
    categories,
    statuses: PAGE_STATUSES,
    summary: {
      pages: shown.length,
      done: sum(shown, (r) => r.done),
      total: sum(shown, (r) => r.total),
      percent: pctOf(rows),
      products: countOf(withProducts.filter((r) => !isProject(r))),
      projects: countOf(withProducts.filter(isProject)),
      byCategory: categories
        .map((c) => rows.filter((r) => r.category === c))
        .filter((l) => l.length)
        .map((l) => ({ name: l[0].category, pages: l.length, percent: pctOf(l) })),
      byPerson: [...groupBy(rows.filter((r) => r.assignee_id), (r) => r.assignee_name)].map(([name, list]) => ({
        name,
        pages: list.length,
        percent: pctOf(list),
      })),
    },
  };
}

async function pageOr404(id) {
  const page = await repo.findPage(id);
  if (!page) throw notFound('Không tìm thấy trang này.');
  return page;
}
async function itemOr404(id) {
  const item = await repo.findItem(id);
  if (!item) throw notFound('Không tìm thấy mục này.');
  return item;
}

export async function createPage(input, user) {
  const result = validate(newPageSchema, input);
  if (!result.ok) return result;
  return { ok: true, data: await repo.createPage({ ...result.data, path: result.data.path ?? null }, user.id) };
}

export async function updatePage(id, input) {
  const page = await pageOr404(id);
  const result = validate(pageSchema, input);
  if (!result.ok) return result;
  const { category, status, assignee_id = null, deadline = null } = result.data;
  await repo.updatePage(page.id, { category, status, assignee_id, deadline });
  return { ok: true, data: page };
}

export async function deletePage(id, user) {
  const page = await pageOr404(id);
  if (!isManager(user) && page.created_by !== user.id) throw forbidden('Chỉ quản lý hoặc người thêm trang này mới xoá được.');
  await repo.removePage(page.id);
  return page;
}

export async function addItem(pageId, input) {
  const page = await pageOr404(pageId);
  const result = validate(itemSchema, input);
  if (!result.ok) return result;
  await repo.addItem({ page_id: page.id, ...result.data });
  return { ok: true, data: page };
}

export async function toggleItem(id, done) {
  const item = await itemOr404(id);
  await repo.setItemDone(item.id, done ? 1 : 0);
  return item;
}

export async function doneAll(pageId) {
  const page = await pageOr404(pageId);
  await repo.doneAllItems(page.id);
  return page;
}

export async function deleteItem(id) {
  const item = await itemOr404(id);
  await repo.removeItem(item.id);
  return item;
}
