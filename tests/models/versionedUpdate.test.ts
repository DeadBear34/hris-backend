import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const { updateVersioned } = await import("../../src/models/versionedUpdate.js");

const ID = "33333333-3333-4333-8333-333333333333";
const current = jest.fn(() => Promise.resolve({ id: ID }));

function lastCall(): [string, unknown[]] {
  return mockQuery.mock.calls.at(-1) as [string, unknown[]];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ id: ID }] } as never);
});

describe("updateVersioned", () => {
  it("hanya menulis kolom yang diizinkan dan bernilai", async () => {
    await updateVersioned({
      table: "departments",
      id: ID,
      data: { name: "IT", code: undefined, role: "admin" },
      columns: ["code", "name"],
      returning: "*",
      current,
    });

    const [sql, params] = lastCall();

    expect(sql).toContain("SET name = $1, updated_at = now()");
    expect(sql).not.toContain("role");
    expect(params).toEqual(["IT", ID, null]);
  });

  it("memasang cast sesuai kolom", async () => {
    await updateVersioned({
      table: "departments",
      id: ID,
      data: { max_concurrent_leave: 2 },
      columns: ["max_concurrent_leave"],
      casts: { max_concurrent_leave: "::int" },
      returning: "*",
      current,
    });

    expect(lastCall()[0]).toContain("max_concurrent_leave = $1::int");
  });

  it("memeriksa versi updated_at yang dikirim klien", async () => {
    await updateVersioned({
      table: "departments",
      id: ID,
      data: { name: "IT" },
      columns: ["name"],
      returning: "*",
      expectedUpdatedAt: "2026-10-12T00:00:00.000Z",
      current,
    });

    const [sql, params] = lastCall();

    expect(sql).toContain("deleted_at IS NULL");
    expect(sql).toContain("date_trunc('milliseconds', updated_at)");
    expect(params[2]).toBe("2026-10-12T00:00:00.000Z");
  });

  it("tabel tanpa soft delete tidak memakai deleted_at", async () => {
    await updateVersioned({
      table: "holidays",
      id: ID,
      data: { name: "Libur" },
      columns: ["name"],
      returning: "id",
      softDelete: false,
      current,
    });

    expect(lastCall()[0]).not.toContain("deleted_at");
  });

  it("tanpa kolom yang berubah tidak menulis apa pun", async () => {
    const row = await updateVersioned({
      table: "departments",
      id: ID,
      data: { name: undefined },
      columns: ["name"],
      returning: "*",
      current,
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(1);
    expect(row).toEqual({ id: ID });
  });

  it("null bila baris tidak ditemukan atau versinya berbeda", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const row = await updateVersioned({
      table: "departments",
      id: ID,
      data: { name: "IT" },
      columns: ["name"],
      returning: "*",
      current,
    });

    expect(row).toBeNull();
  });
});
