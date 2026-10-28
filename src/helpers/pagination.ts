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

// Respons standar untuk daftar berhalaman: { success, data, meta }
export function paginated<T>(
  data: T[],
  total: number,
  query: { page: number; limit: number },
) {
  return {
    success: true as const,
    data,
    meta: paginationMeta(total, query.page, query.limit),
  };
}
