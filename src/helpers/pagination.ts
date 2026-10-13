export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// Satu rumus untuk semua daftar. Data kosong berarti total_pages 0
export function paginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}
