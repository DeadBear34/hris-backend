import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockClient = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/employee.js", () => ({
  findByUserId: jest.fn(),
  findById: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/position.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  createPosition: jest.fn(),
  updatePosition: jest.fn(),
  softDeletePosition: jest.fn(),
  countEmployees: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findAllFeatures: jest.fn(),
  findAllCodes: jest.fn(),
  findByCodes: jest.fn(),
  findCodesByPosition: jest.fn(),
  findFeaturesByPosition: jest.fn(),
  findCodesByEmployee: jest.fn(),
  findMatrix: jest.fn(),
  replacePositionFeatures: jest.fn(),
  countGrantsByPosition: jest.fn(),
}));

const employeeModel = await import("../../src/models/employee.js");
const positionModel = await import("../../src/models/position.js");
const featureModel = await import("../../src/models/feature.js");
const userModel = await import("../../src/models/user.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { batalkanCacheFitur, ambilDariCache } =
  await import("../../src/helpers/featureCache.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";
const FEATURE_ID = "44444444-4444-4444-8444-444444444444";

const adminToken = createToken({
  id: USER_ID,
  email: "admin@awan.io",
  role: "admin",
});
const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const fakePosition = {
  id: POSITION_ID,
  code: "HR_MGR",
  name: "HR Manager",
  level: 5,
};

const fakeFeature = {
  id: FEATURE_ID,
  code: "employee.view_all",
  name: "Lihat Semua Karyawan",
  description: "Melihat daftar dan detail seluruh karyawan",
  category: "employee",
  is_active: true,
};

const fakeFeatureLeave = {
  ...fakeFeature,
  id: "55555555-5555-4555-8555-555555555555",
  code: "leave.view_all",
  name: "Lihat Semua Cuti",
  category: "leave",
};

beforeEach(() => {
  jest.clearAllMocks();
  batalkanCacheFitur();
  mockClient.query.mockResolvedValue({ rows: [] } as never);
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
    id: EMPLOYEE_ID,
    user_id: USER_ID,
    position_id: POSITION_ID,
  } as never);
  (positionModel.findById as jest.Mock).mockResolvedValue(
    fakePosition as never,
  );
  (positionModel.findAll as jest.Mock).mockResolvedValue([
    fakePosition,
  ] as never);
  (featureModel.findAllFeatures as jest.Mock).mockResolvedValue([
    fakeFeature,
    fakeFeatureLeave,
  ] as never);
  (featureModel.findFeaturesByPosition as jest.Mock).mockResolvedValue([
    fakeFeature,
  ] as never);
  (featureModel.findByCodes as jest.Mock).mockResolvedValue([
    fakeFeature,
  ] as never);
  (featureModel.findMatrix as jest.Mock).mockResolvedValue([
    { position_id: POSITION_ID, feature_id: FEATURE_ID },
  ] as never);
  (featureModel.replacePositionFeatures as jest.Mock).mockResolvedValue(
    1 as never,
  );
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
    "system.manage_feature",
  ] as never);
  (featureModel.findAllCodes as jest.Mock).mockResolvedValue([
    "employee.view_all",
    "leave.view_all",
  ] as never);
});

describe("GET /api/v1/features", () => {
  it("menolak tamu", async () => {
    const res = await request(app).get("/api/v1/features");

    expect(res.status).toBe(401);
  });

  it("mengelompokkan fitur per kategori", async () => {
    const res = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(
      res.body.data.categories.map((k: { category: string }) => k.category),
    ).toEqual(["employee", "leave"]);
  });

  it("menyertakan label kategori berbahasa Indonesia", async () => {
    const res = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.categories[0].label).toBe("Kepegawaian");
  });

  it("tidak menampilkan kategori yang kosong", async () => {
    const res = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.categories).toHaveLength(2);
  });
});

describe("pengelolaan fitur hanya untuk admin", () => {
  /**
   * Pengelolaan fitur dijaga role, bukan fitur. Karyawan yang jabatannya
   * kebetulan diberi system.manage_feature tetap harus ditolak, karena kalau
   * tidak ia dapat memperluas kewenangannya sendiri tanpa batas.
   */
  beforeEach(() => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "system.manage_feature",
    ] as never);
  });

  it("menolak karyawan pada katalog fitur", async () => {
    const res = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak karyawan pada matriks fitur", async () => {
    const res = await request(app)
      .get("/api/v1/features/matrix")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak karyawan membaca fitur sebuah jabatan", async () => {
    const res = await request(app)
      .get(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menolak karyawan mengganti fitur sebuah jabatan", async () => {
    const res = await request(app)
      .put(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ codes: ["employee.view_all"] });

    expect(res.status).toBe(403);
    expect(featureModel.replacePositionFeatures).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/positions/:id/features", () => {
  it("mengembalikan kode dan detail fitur jabatan", async () => {
    const res = await request(app)
      .get(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.codes).toEqual(["employee.view_all"]);
    expect(res.body.data.position.code).toBe("HR_MGR");
  });

  it("mengembalikan 404 untuk jabatan yang tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .get(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .get("/api/v1/positions/123/features")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/v1/positions/:id/features", () => {
  function ganti(codes: unknown) {
    return request(app)
      .put(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codes });
  }

  it("mengganti seluruh fitur jabatan", async () => {
    const res = await ganti(["employee.view_all"]);

    expect(res.status).toBe(200);
    expect(featureModel.replacePositionFeatures).toHaveBeenCalledWith(
      mockClient,
      POSITION_ID,
      [FEATURE_ID],
      USER_ID,
    );
  });

  it("membungkus penggantian dalam satu transaksi", async () => {
    await ganti(["employee.view_all"]);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("menjalankan ROLLBACK saat penggantian gagal", async () => {
    (featureModel.replacePositionFeatures as jest.Mock).mockRejectedValue(
      new Error("gagal menulis") as never,
    );

    const res = await ganti(["employee.view_all"]);

    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.query).not.toHaveBeenCalledWith("COMMIT");
    expect(res.status).toBe(500);
  });

  it("selalu mengembalikan koneksi ke pool", async () => {
    (featureModel.replacePositionFeatures as jest.Mock).mockRejectedValue(
      new Error("gagal menulis") as never,
    );

    await ganti(["employee.view_all"]);

    expect(mockClient.release).toHaveBeenCalled();
  });

  it("menolak kode fitur yang tidak dikenal dan menyebutkan kodenya", async () => {
    (featureModel.findByCodes as jest.Mock).mockResolvedValue([
      fakeFeature,
    ] as never);

    const res = await ganti(["employee.view_all", "fitur.karangan"]);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("fitur.karangan");
    expect(res.body.details.unknown_codes).toEqual(["fitur.karangan"]);
    expect(featureModel.replacePositionFeatures).not.toHaveBeenCalled();
  });

  it("menerima daftar kosong sebagai pencabutan seluruh fitur", async () => {
    (featureModel.findByCodes as jest.Mock).mockResolvedValue([] as never);

    const res = await ganti([]);

    expect(res.status).toBe(200);
    expect(featureModel.replacePositionFeatures).toHaveBeenCalledWith(
      mockClient,
      POSITION_ID,
      [],
      USER_ID,
    );
  });

  it("membuang kode duplikat sebelum menyimpan", async () => {
    await ganti(["employee.view_all", "employee.view_all"]);

    const [, , ids] = (featureModel.replacePositionFeatures as jest.Mock).mock
      .calls[0] as [unknown, string, string[]];

    expect(ids).toEqual([FEATURE_ID]);
  });

  it("membatalkan cache jabatan setelah perubahan", async () => {
    // isi cache lebih dulu lewat pemeriksaan fitur
    await request(app)
      .get("/api/v1/leave-requests/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    await ganti(["employee.view_all"]);

    expect(ambilDariCache(POSITION_ID)).toBeNull();
  });

  it("tidak membatalkan cache bila penggantian gagal", async () => {
    (featureModel.replacePositionFeatures as jest.Mock).mockRejectedValue(
      new Error("gagal menulis") as never,
    );

    await ganti(["employee.view_all"]);

    // cache dibatalkan hanya setelah COMMIT berhasil
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("menolak body tanpa codes", async () => {
    const res = await request(app)
      .put(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("menolak codes yang bukan array", async () => {
    const res = await ganti("employee.view_all");

    expect(res.status).toBe(400);
  });

  it("mengembalikan 404 untuk jabatan yang tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await ganti(["employee.view_all"]);

    expect(res.status).toBe(404);
    expect(featureModel.replacePositionFeatures).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/features/matrix", () => {
  it("mengembalikan jabatan, kategori fitur, dan pasangan aktif sekaligus", async () => {
    const res = await request(app)
      .get("/api/v1/features/matrix")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.positions).toHaveLength(1);
    expect(res.body.data.categories).toHaveLength(2);
    expect(res.body.data.grants).toEqual([
      { position_id: POSITION_ID, feature_id: FEATURE_ID },
    ]);
  });
});

describe("GET /api/v1/me/features", () => {
  it("menolak tamu", async () => {
    const res = await request(app).get("/api/v1/me/features");

    expect(res.status).toBe(401);
  });

  it("mengembalikan seluruh kode untuk admin", async () => {
    const res = await request(app)
      .get("/api/v1/me/features")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_admin).toBe(true);
    expect(res.body.data.codes).toEqual([
      "employee.view_all",
      "leave.view_all",
    ]);
  });

  it("mengembalikan fitur jabatan untuk karyawan", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
      "leave.approve_team",
    ] as never);

    const res = await request(app)
      .get("/api/v1/me/features")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_admin).toBe(false);
    expect(res.body.data.codes).toEqual(["leave.approve_team"]);
  });

  it("mengembalikan daftar kosong untuk karyawan tanpa jabatan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      id: EMPLOYEE_ID,
      user_id: USER_ID,
      position_id: null,
    } as never);

    const res = await request(app)
      .get("/api/v1/me/features")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.codes).toEqual([]);
  });
});
