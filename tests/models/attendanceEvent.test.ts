import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const eventModel = await import("../../src/models/attendanceEvent.js");

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ATTENDANCE_ID = "33333333-3333-4333-8333-333333333333";

const fakeEvent = {
  id: EVENT_ID,
  employee_id: EMPLOYEE_ID,
  kind: "check_in",
  occurred_at: new Date("2026-03-10T00:58:00.123Z"),
  received_at: new Date("2026-03-10T02:30:00.456Z"),
  source: "offline_sync",
  attendance_id: null,
  rejection_reason: null,
  note: null,
  created_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

function panggilan(indeks = -1): [string, unknown[]] {
  const [sql, values] = mockQuery.mock.calls.at(indeks) as [string, unknown[]];

  return [sql.replace(/\s+/g, " "), values];
}

describe("recordEvent", () => {
  it("menyimpan waktu tekan dan waktu terima sebagai dua kolom terpisah", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeEvent] } as never);

    const ditekan = new Date("2026-03-10T00:58:00.123Z");
    const diterima = new Date("2026-03-10T02:30:00.456Z");

    await eventModel.recordEvent({
      employee_id: EMPLOYEE_ID,
      kind: "check_in",
      occurred_at: ditekan,
      received_at: diterima,
      source: "offline_sync",
    });

    const [sql, values] = panggilan();

    expect(sql).toContain("INSERT INTO attendance_events");
    expect(values).toEqual([
      EMPLOYEE_ID,
      "check_in",
      ditekan,
      diterima,
      "offline_sync",
      null,
    ]);
  });

  it("tidak menyertakan kolom hasil olahan apa pun", async () => {
    mockQuery.mockResolvedValue({ rows: [fakeEvent] } as never);

    await eventModel.recordEvent({
      employee_id: EMPLOYEE_ID,
      kind: "check_in",
      occurred_at: new Date(),
      received_at: new Date(),
      source: "online",
    });

    const [sql] = panggilan();

    // kejadian mentah tidak mengenal status maupun keterlambatan
    expect(sql).not.toContain("status");
    expect(sql).not.toContain("late_minutes");
  });

  it("melempar galat ketika penyimpanan tidak mengembalikan baris", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(
      eventModel.recordEvent({
        employee_id: EMPLOYEE_ID,
        kind: "check_in",
        occurred_at: new Date(),
        received_at: new Date(),
        source: "online",
      }),
    ).rejects.toThrow("Gagal mencatat kejadian absensi");
  });
});

describe("penautan dan penolakan", () => {
  it("menautkan kejadian ke absensi yang dihasilkannya", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await eventModel.linkToAttendance(EVENT_ID, ATTENDANCE_ID);

    const [sql, values] = panggilan();

    expect(sql).toContain("SET attendance_id = $2::uuid");
    expect(values).toEqual([EVENT_ID, ATTENDANCE_ID]);
  });

  it("menandai kejadian yang ditolak beserta alasannya", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await eventModel.markRejected(EVENT_ID, "Tanggal tersebut hari libur");

    const [sql, values] = panggilan();

    expect(sql).toContain("SET rejection_reason = $2");
    expect(values).toEqual([EVENT_ID, "Tanggal tersebut hari libur"]);
  });
});

describe("listEvents", () => {
  beforeEach(() => {
    mockQuery.mockResolvedValue({ rows: [{ count: "0" }] } as never);
  });

  it("menghitung jeda antara tekan dan terima dalam detik", async () => {
    await eventModel.listEvents({ page: 1, limit: 20 });

    const [sql] = panggilan();

    expect(sql).toContain(
      "EXTRACT(EPOCH FROM (ev.received_at - ev.occurred_at))::int AS delay_seconds",
    );
  });

  it("dapat dipersempit ke percobaan yang ditolak saja", async () => {
    await eventModel.listEvents({ only_rejected: true, page: 1, limit: 20 });

    const [sql] = panggilan(0);

    expect(sql).toContain("ev.rejection_reason IS NOT NULL");
  });

  it("menyaring jenis dan sumber kejadian", async () => {
    await eventModel.listEvents({
      kind: "check_out",
      source: "offline_sync",
      page: 1,
      limit: 20,
    });

    const [sql, values] = panggilan(0);

    expect(sql).toContain("ev.kind = $1::attendance_event_kind");
    expect(sql).toContain("ev.source = $2::attendance_source");
    expect(values.slice(0, 2)).toEqual(["check_out", "offline_sync"]);
  });

  it("tanggal akhir mencakup seluruh hari itu", async () => {
    await eventModel.listEvents({
      end_date: "2026-03-10",
      page: 1,
      limit: 20,
    });

    const [sql] = panggilan(0);

    expect(sql).toContain("ev.occurred_at < $1::date + 1");
  });

  it("mengurutkan dari kejadian terbaru", async () => {
    await eventModel.listEvents({ page: 1, limit: 20 });

    const [sql] = panggilan();

    expect(sql).toContain("ORDER BY ev.occurred_at DESC");
  });
});
