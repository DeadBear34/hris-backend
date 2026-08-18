import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockQuery = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: mockQuery, connect: jest.fn() },
}));

const featureModel = await import("../../src/models/feature.js");

const POSITION_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const FEATURE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const fakeDb = { query: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
  (fakeDb.query as jest.Mock).mockResolvedValue({
    rows: [],
    rowCount: 0,
  } as never);
});

describe("findAllFeatures", () => {
  it("hanya mengambil fitur yang aktif", async () => {
    await featureModel.findAllFeatures();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("is_active = true");
  });

  it("mengurutkan per kategori lalu kode", async () => {
    await featureModel.findAllFeatures();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("ORDER BY category ASC, code ASC");
  });
});

describe("findByCodes", () => {
  it("tidak menyentuh database untuk daftar kosong", async () => {
    const hasil = await featureModel.findByCodes([]);

    expect(hasil).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("mengirim daftar kode sebagai satu parameter array", async () => {
    await featureModel.findByCodes(["employee.view_all", "leave.view_all"]);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("code = ANY($1::text[])");
    expect(values).toEqual([["employee.view_all", "leave.view_all"]]);
  });
});

describe("findCodesByPosition", () => {
  it("menggabungkan pemberian fitur dengan katalognya", async () => {
    await featureModel.findCodesByPosition(POSITION_ID);

    const [sql, values] = mockQuery.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("FROM position_features pf");
    expect(sql).toContain("JOIN features f ON f.id = pf.feature_id");
    expect(sql).toContain("pf.position_id = $1::uuid");
    expect(values).toEqual([POSITION_ID]);
  });

  it("mengembalikan kode saja, bukan barisnya", async () => {
    mockQuery.mockResolvedValue({
      rows: [{ code: "employee.view_all" }, { code: "leave.view_all" }],
    } as never);

    const codes = await featureModel.findCodesByPosition(POSITION_ID);

    expect(codes).toEqual(["employee.view_all", "leave.view_all"]);
  });

  it("mengabaikan fitur yang dinonaktifkan", async () => {
    await featureModel.findCodesByPosition(POSITION_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("f.is_active = true");
  });
});

describe("findCodesByEmployee", () => {
  it("menurunkan fitur lewat jabatan karyawan", async () => {
    await featureModel.findCodesByEmployee(EMPLOYEE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("FROM employees e");
    expect(sql).toContain("pf.position_id = e.position_id");
  });

  it("mengabaikan karyawan yang sudah dihapus", async () => {
    await featureModel.findCodesByEmployee(EMPLOYEE_ID);

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("e.deleted_at IS NULL");
  });
});

describe("replacePositionFeatures", () => {
  it("menghapus seluruh pemberian lama lebih dulu", async () => {
    await featureModel.replacePositionFeatures(
      fakeDb as never,
      POSITION_ID,
      [FEATURE_ID],
      USER_ID,
    );

    const [sql, values] = (fakeDb.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(sql).toContain("DELETE FROM position_features");
    expect(values).toEqual([POSITION_ID]);
  });

  it("memasukkan pemberian baru beserta pencatat pemberinya", async () => {
    await featureModel.replacePositionFeatures(
      fakeDb as never,
      POSITION_ID,
      [FEATURE_ID],
      USER_ID,
    );

    const [sql, values] = (fakeDb.query as jest.Mock).mock.calls[1] as [
      string,
      unknown[],
    ];

    expect(sql).toContain("INSERT INTO position_features");
    expect(sql).toContain("unnest($2::uuid[])");
    expect(values).toEqual([POSITION_ID, [FEATURE_ID], USER_ID]);
  });

  it("cukup menghapus saja bila daftar barunya kosong", async () => {
    const jumlah = await featureModel.replacePositionFeatures(
      fakeDb as never,
      POSITION_ID,
      [],
      USER_ID,
    );

    expect(jumlah).toBe(0);
    expect(fakeDb.query).toHaveBeenCalledTimes(1);
  });

  it("dijalankan memakai client transaksi, bukan pool", async () => {
    await featureModel.replacePositionFeatures(
      fakeDb as never,
      POSITION_ID,
      [FEATURE_ID],
      USER_ID,
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("findMatrix", () => {
  it("hanya memuat pasangan dengan fitur yang masih aktif", async () => {
    await featureModel.findMatrix();

    const [sql] = mockQuery.mock.calls[0] as [string];

    expect(sql).toContain("f.is_active = true");
    expect(sql).toContain("pf.position_id, pf.feature_id");
  });
});

describe("countGrantsByPosition", () => {
  it("menghitung pemberian fitur sebuah jabatan", async () => {
    mockQuery.mockResolvedValue({ rows: [{ count: "13" }] } as never);

    const jumlah = await featureModel.countGrantsByPosition(POSITION_ID);

    expect(jumlah).toBe(13);
  });

  it("mengembalikan nol bila belum ada pemberian", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const jumlah = await featureModel.countGrantsByPosition(POSITION_ID);

    expect(jumlah).toBe(0);
  });
});
