// Phân trang dùng chung cho mọi danh sách.
//   const page = parsePage(req.query);              // { page, perPage, offset }
//   const total = await repo.count(...);
//   res.render('...', { pagination: buildPagination({ ...page, total, query: req.query }) })

export function parsePage(query = {}, defaultPerPage = 20) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(query.perPage, 10) || defaultPerPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function buildPagination({ page, perPage, total, query = {} }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const linkTo = (p) => {
    const params = new URLSearchParams({ ...query, page: String(p) });
    return `?${params.toString()}`;
  };
  return {
    page,
    perPage,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    prevUrl: linkTo(page - 1),
    nextUrl: linkTo(page + 1),
  };
}
