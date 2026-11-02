import { describe, it, expect } from "@jest/globals";
import { paginated, paginationMeta } from "../../src/helpers/pagination.js";

describe("paginationMeta", () => {
  it("membulatkan jumlah halaman ke atas", () => {
    expect(paginationMeta(41, 2, 20)).toEqual({
      page: 2,
      limit: 20,
      total: 41,
      total_pages: 3,
    });
  });

  it("data kosong berarti nol halaman", () => {
    expect(paginationMeta(0, 1, 20).total_pages).toBe(0);
  });
});

describe("paginated", () => {
  it("membungkus data dengan success dan meta halaman", () => {
    expect(paginated(["a", "b"], 12, { page: 2, limit: 5 })).toEqual({
      success: true,
      data: ["a", "b"],
      meta: { page: 2, limit: 5, total: 12, total_pages: 3 },
    });
  });

  it("daftar kosong tetap punya meta", () => {
    expect(paginated([], 0, { page: 1, limit: 10 })).toEqual({
      success: true,
      data: [],
      meta: { page: 1, limit: 10, total: 0, total_pages: 0 },
    });
  });
});
