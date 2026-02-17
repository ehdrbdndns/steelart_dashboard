export function parsePagination(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page") ?? "1");
  const size = Number(searchParams.get("size") ?? "20");

  const safePage = Number.isNaN(page) || page < 1 ? 1 : Math.floor(page);
  const safeSize =
    Number.isNaN(size) || size < 1 ? 20 : Math.min(100, Math.floor(size));

  return {
    page: safePage,
    size: safeSize,
    offset: (safePage - 1) * safeSize,
  };
}

export function makePaginationMeta(total: number, page: number, size: number) {
  return {
    total,
    page,
    size,
    totalPages: Math.ceil(total / size),
  };
}
