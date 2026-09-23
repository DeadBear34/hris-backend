import { jest, describe, it, expect, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../src/models/activityLog.js", () => ({
  findLatestChange: jest.fn(),
}));

const activityLogModel = await import("../../src/models/activityLog.js");
const { sameVersion, rejectStaleUpdate, STALE_DATA_CODE } =
  await import("../../src/helpers/concurrency.js");

const current = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Keuangan & Akuntansi",
  updated_at: new Date("2026-09-14T08:04:33.373Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("sameVersion", () => {
  it("membandingkan kedua sisi pada presisi milidetik", () => {
    const sql = sameVersion("updated_at", 3);

    expect(sql).toContain("date_trunc('milliseconds', updated_at)");
    expect(sql).toContain("date_trunc('milliseconds', $3::timestamptz)");
  });

  it("melewati pemeriksaan kalau klien tidak mengirim updated_at", () => {
    expect(sameVersion("updated_at", 3)).toContain("$3::timestamptz IS NULL");
  });
});

describe("rejectStaleUpdate", () => {
  it("menjawab 404 kalau datanya sudah dihapus", async () => {
    const err = await rejectStaleUpdate(
      "department",
      async () => null,
      "Department not found",
    );

    expect(err.statusCode).toBe(404);
    expect(activityLogModel.findLatestChange).not.toHaveBeenCalled();
  });

  it("menjawab 409 beserta data terbaru dan siapa yang mengubahnya", async () => {
    (activityLogModel.findLatestChange as jest.Mock).mockResolvedValue({
      action: "department.update",
      actor_name: "Bagus Pratama",
      actor_email: "bagus@awan.io",
      occurred_at: new Date("2026-09-14T08:04:33.373Z"),
    } as never);

    const err = await rejectStaleUpdate(
      "department",
      async () => current,
      "Department not found",
    );

    const details = err.details as {
      current: unknown;
      last_changed_by: { name: string; action: string };
    };

    expect(err.statusCode).toBe(409);
    expect(err.code).toBe(STALE_DATA_CODE);
    expect(details.current).toBe(current);
    expect(details.last_changed_by.name).toBe("Bagus Pratama");
    expect(activityLogModel.findLatestChange).toHaveBeenCalledWith(
      "department",
      current.id,
    );
  });

  it("tetap menjawab 409 walau catatan pengubah gagal dibaca", async () => {
    (activityLogModel.findLatestChange as jest.Mock).mockRejectedValue(
      new Error("database sibuk") as never,
    );

    const err = await rejectStaleUpdate(
      "department",
      async () => current,
      "Department not found",
    );

    expect(err.statusCode).toBe(409);
    expect(
      (err.details as { last_changed_by: unknown }).last_changed_by,
    ).toBeNull();
  });
});
