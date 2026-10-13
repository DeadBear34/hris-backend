import { describe, it, expect } from "@jest/globals";
import { paginationMeta } from "../../src/helpers/pagination.js";

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
