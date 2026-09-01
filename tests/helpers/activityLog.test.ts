import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockInfo = jest.fn();
const mockWarn = jest.fn();

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: mockInfo, warn: mockWarn, error: jest.fn() },
}));

const { buildActivityLog, recordActivity, requestContext, summarizeList } =
  await import("../../src/helpers/activityLog.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";

const context = {
  actor_user_id: USER_ID,
  ip_address: "203.0.113.9",
  user_agent: "Mozilla/5.0",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requestContext", () => {
  it("mengambil pelaku, alamat ip, dan user agent dari permintaan", () => {
    const result = requestContext({
      user: { id: USER_ID },
      ip: "203.0.113.9",
      headers: { "user-agent": "Mozilla/5.0" },
    } as never);

    expect(result).toEqual(context);
  });

  it("mengisi null ketika permintaan tidak membawa keterangannya", () => {
    const result = requestContext({ headers: {} } as never);

    expect(result).toEqual({
      actor_user_id: null,
      ip_address: null,
      user_agent: null,
    });
  });
});

describe("buildActivityLog", () => {
  it("menyusun catatan lengkap dengan waktu pembuatannya", () => {
    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      entity_id: "emp-1",
      summary: "Karyawan Andi ditambahkan",
      metadata: { created: 1 },
      occurred_at: new Date(Date.now() - 120),
    });

    expect(entry).toMatchObject({
      action: "employee.create",
      status: "success",
      actor_user_id: USER_ID,
      entity: "employee",
      entity_id: "emp-1",
      ip_address: "203.0.113.9",
      user_agent: "Mozilla/5.0",
    });
    expect(entry.created_at).toBeInstanceOf(Date);
    expect(entry.occurred_at).toBeInstanceOf(Date);
  });

  it("mengisi nilai bawaan untuk bagian yang tidak disebutkan", () => {
    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "tanpa rincian",
      occurred_at: new Date(),
    });

    expect(entry.entity_id).toBeNull();
    expect(entry.actor_employee_id).toBeNull();
    expect(entry.metadata).toEqual({});
  });

  it("bentuknya memuat seluruh kolom yang nanti disimpan ke tabel log", () => {
    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "cek kolom",
      occurred_at: new Date(),
    });

    expect(Object.keys(entry).sort()).toEqual(
      [
        "action",
        "actor_employee_id",
        "actor_user_id",
        "created_at",
        "duration_ms",
        "entity",
        "occurred_at",
        "entity_id",
        "ip_address",
        "metadata",
        "status",
        "summary",
        "user_agent",
      ].sort(),
    );
  });
});

describe("recordActivity", () => {
  it("menulis keberhasilan pada tingkat info", () => {
    recordActivity({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "Karyawan ditambahkan",
      occurred_at: new Date(),
    });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("menulis kegagalan pada tingkat warn agar mudah disaring", () => {
    recordActivity({
      action: "employee.create",
      status: "failed",
      context,
      entity: "employee",
      summary: "Penambahan ditolak",
      occurred_at: new Date(),
    });

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("menaruh catatan di bawah kunci activity beserta ringkasannya", () => {
    recordActivity({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "Karyawan Andi ditambahkan",
      occurred_at: new Date(),
    });

    const [muatan, message] = mockInfo.mock.calls[0] as [
      { activity: { action: string } },
      string,
    ];

    expect(muatan.activity.action).toBe("employee.create");
    expect(message).toBe("Karyawan Andi ditambahkan");
  });

  it("mengembalikan catatan yang sama dengan yang ditulis", () => {
    const entry = recordActivity({
      action: "employee.create_bulk",
      status: "success",
      context,
      entity: "employee",
      summary: "3 karyawan ditambahkan",
      metadata: { created: 3 },
      occurred_at: new Date(),
    });

    const [muatan] = mockInfo.mock.calls[0] as [{ activity: unknown }];

    expect(muatan.activity).toBe(entry);
  });
});

describe("waktu pada catatan", () => {
  it("mencatat kapan peristiwa terjadi, terpisah dari kapan catatan dibuat", () => {
    const mulai = new Date(Date.now() - 500);

    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "cek waktu",
      occurred_at: mulai,
    });

    expect(entry.occurred_at).toBe(mulai);
    expect(entry.created_at.getTime()).toBeGreaterThanOrEqual(mulai.getTime());
  });

  it("menghitung lama proses dari selisih keduanya", () => {
    const mulai = new Date(Date.now() - 500);

    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "cek durasi",
      occurred_at: mulai,
    });

    expect(entry.duration_ms).toBe(
      entry.created_at.getTime() - entry.occurred_at.getTime(),
    );
    expect(entry.duration_ms).toBeGreaterThanOrEqual(500);
  });

  it("durasi tidak pernah negatif untuk peristiwa yang baru saja terjadi", () => {
    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "cek durasi nol",
      occurred_at: new Date(),
    });

    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe("ringkasDaftar", () => {
  it("daftar pendek diteruskan utuh", () => {
    const result = summarizeList([1, 2, 3]);

    expect(result).toEqual({ total: 3, sample: [1, 2, 3], truncated: false });
  });

  it("daftar panjang dipotong tetapi jumlahnya tetap benar", () => {
    const result = summarizeList(Array.from({ length: 500 }, (_, i) => i));

    expect(result.total).toBe(500);
    expect(result.sample).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  it("daftar kosong tidak ditandai terpotong", () => {
    expect(summarizeList([])).toEqual({
      total: 0,
      sample: [],
      truncated: false,
    });
  });
});

describe("durasi tidak pernah negatif", () => {
  it("jam sistem yang mundur tetap menghasilkan nol, bukan angka negatif", () => {
    const masaDepan = new Date(Date.now() + 60_000);

    const entry = buildActivityLog({
      action: "employee.create",
      status: "success",
      context,
      entity: "employee",
      summary: "jam mundur",
      occurred_at: masaDepan,
    });

    expect(entry.duration_ms).toBe(0);
  });
});
