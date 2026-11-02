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
  findSessionInfo: jest.fn(() =>
    Promise.resolve({
      id: "session-user",
      password_changed_at: null,
      is_active: true,
    }),
  ),
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
  touchPosition: jest.fn(),
  softDeletePosition: jest.fn(),
  countEmployees: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findAllFeatures: jest.fn(),
  findAllCodes: jest.fn(),
  findByCodes: jest.fn(),
  findCodesByPosition: jest.fn(),
  findFeaturesByPosition: jest.fn(),
  findMatrix: jest.fn(),
  replacePositionFeatures: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/accessProfile.js", () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByName: jest.fn(),
  findByExactCodes: jest.fn(),
  createProfile: jest.fn(),
  updateProfile: jest.fn(),
  replaceFeatures: jest.fn(),
  syncPositions: jest.fn(),
  assignToPosition: jest.fn(),
  deleteProfile: jest.fn(),
  findAssignments: jest.fn(),
}));

const employeeModel = await import("../../src/models/employee.js");
const profileModel = await import("../../src/models/accessProfile.js");
const positionModel = await import("../../src/models/position.js");
const featureModel = await import("../../src/models/feature.js");
const userModel = await import("../../src/models/user.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { invalidateFeatureCache, readFromCache } =
  await import("../../src/helpers/featureCache.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";
const FEATURE_ID = "44444444-4444-4444-8444-444444444444";
const PROFILE_ID = "66666666-6666-4666-8666-666666666666";

const fakeProfile = {
  id: PROFILE_ID,
  code: "hr_viewer",
  name: "Pengamat HR",
  description: null,
  is_system: true,
  codes: ["employee.view_all"],
  position_count: 3,
  employee_count: 5,
  updated_at: "2026-11-01T00:00:00.000Z",
};

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
  invalidateFeatureCache();
  mockClient.query.mockResolvedValue({ rows: [] } as never);
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
    id: "session-user",
    password_changed_at: null,
    is_active: true,
  } as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
    id: EMPLOYEE_ID,
    user_id: USER_ID,
    position_id: POSITION_ID,
  } as never);
  (positionModel.findById as jest.Mock).mockResolvedValue(
    fakePosition as never,
  );
  (positionModel.touchPosition as jest.Mock).mockResolvedValue(
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
  (profileModel.findAll as jest.Mock).mockResolvedValue([fakeProfile] as never);
  (profileModel.findById as jest.Mock).mockResolvedValue(fakeProfile as never);
  (profileModel.findByName as jest.Mock).mockResolvedValue(null as never);
  (profileModel.findByExactCodes as jest.Mock).mockResolvedValue(null as never);
  (profileModel.createProfile as jest.Mock).mockResolvedValue(
    PROFILE_ID as never,
  );
  (profileModel.updateProfile as jest.Mock).mockResolvedValue({
    id: PROFILE_ID,
  } as never);
  (profileModel.syncPositions as jest.Mock).mockResolvedValue([
    POSITION_ID,
  ] as never);
  (profileModel.assignToPosition as jest.Mock).mockResolvedValue({
    id: POSITION_ID,
    updated_at: new Date("2026-11-01T01:00:00Z"),
  } as never);
  (profileModel.findAssignments as jest.Mock).mockResolvedValue([
    {
      position_id: POSITION_ID,
      access_profile_id: PROFILE_ID,
      holder_count: 3,
    },
  ] as never);
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

    expect(res.body.data.categories[0].label).toBe("Employment");
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

describe("PUT /api/v1/positions/:id/features (jalur lama)", () => {
  function replaceFeatures(codes: unknown) {
    return request(app)
      .put(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ codes });
  }

  it("memakai paket yang isinya sama persis, tanpa membuat paket baru", async () => {
    (profileModel.findByExactCodes as jest.Mock).mockResolvedValue({
      id: PROFILE_ID,
      name: "Pengamat HR",
    } as never);

    const res = await replaceFeatures(["employee.view_all"]);

    expect(res.status).toBe(200);
    expect(profileModel.createProfile).not.toHaveBeenCalled();
    expect(profileModel.assignToPosition).toHaveBeenCalledWith(
      mockClient,
      POSITION_ID,
      PROFILE_ID,
      USER_ID,
      undefined,
    );
    expect(res.body.data.access_profile_name).toBe("Pengamat HR");
  });

  it("membuat paket kustom bila kombinasinya belum ada", async () => {
    const res = await replaceFeatures(["employee.view_all"]);

    expect(res.status).toBe(200);

    const [, data] = (profileModel.createProfile as jest.Mock).mock
      .calls[0] as [unknown, { name: string; code: string }];

    expect(data.name).toBe("Kustom: HR Manager");
    expect(data.code).toMatch(/^custom_[0-9a-f]{12}$/);
    expect(profileModel.replaceFeatures).toHaveBeenCalledWith(
      mockClient,
      PROFILE_ID,
      ["employee.view_all"],
    );
  });

  it("daftar kosong melepas paket jabatan", async () => {
    (featureModel.findByCodes as jest.Mock).mockResolvedValue([] as never);

    const res = await replaceFeatures([]);

    expect(res.status).toBe(200);
    expect(profileModel.assignToPosition).toHaveBeenCalledWith(
      mockClient,
      POSITION_ID,
      null,
      USER_ID,
      undefined,
    );
  });

  it("menolak dengan 409 bila jabatan sudah diubah orang lain", async () => {
    (profileModel.assignToPosition as jest.Mock).mockResolvedValue(
      null as never,
    );

    const res = await replaceFeatures(["employee.view_all"]);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_DATA");
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("menolak kode fitur yang tidak dikenal dan menyebutkan kodenya", async () => {
    const res = await replaceFeatures(["employee.view_all", "fitur.karangan"]);

    expect(res.status).toBe(400);
    expect(res.body.details.unknown_codes).toEqual(["fitur.karangan"]);
    expect(profileModel.assignToPosition).not.toHaveBeenCalled();
  });

  it("menolak fitur tanpa fitur yang dibutuhkannya", async () => {
    (featureModel.findByCodes as jest.Mock).mockResolvedValue([
      { ...fakeFeature, code: "employee.update" },
    ] as never);

    const res = await replaceFeatures(["employee.update"]);

    expect(res.status).toBe(400);
    expect(res.body.details.missing_requirements).toEqual([
      { code: "employee.update", requires: ["employee.view_all"] },
    ]);
  });

  it("membatalkan cache jabatan setelah perubahan", async () => {
    await request(app)
      .get("/api/v1/leave-requests/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    await replaceFeatures(["employee.view_all"]);

    expect(readFromCache(POSITION_ID)).toBeNull();
  });

  it("menolak body tanpa codes", async () => {
    const res = await request(app)
      .put(`/api/v1/positions/${POSITION_ID}/features`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("mengembalikan 404 untuk jabatan yang tidak ada", async () => {
    (positionModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await replaceFeatures(["employee.view_all"]);

    expect(res.status).toBe(404);
  });
});

describe("paket akses", () => {
  function asAdmin(
    method: "get" | "post" | "patch" | "delete" | "put",
    url: string,
  ) {
    return request(app)
      [method](url)
      .set("Authorization", `Bearer ${adminToken}`);
  }

  it("hanya admin yang boleh mengelola paket", async () => {
    const res = await request(app)
      .get("/api/v1/access-profiles")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  it("menampilkan paket beserta jumlah jabatan dan karyawannya", async () => {
    const res = await asAdmin("get", "/api/v1/access-profiles");

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      name: "Pengamat HR",
      position_count: 3,
      employee_count: 5,
    });
  });

  it("membuat paket baru dari daftar fitur", async () => {
    const res = await asAdmin("post", "/api/v1/access-profiles").send({
      name: "Tim Payroll",
      codes: ["employee.view_all", "employee.view_all"],
    });

    expect(res.status).toBe(201);
    expect(profileModel.replaceFeatures).toHaveBeenCalledWith(
      mockClient,
      PROFILE_ID,
      ["employee.view_all"],
    );
  });

  it("menolak nama paket yang sudah dipakai", async () => {
    (profileModel.findByName as jest.Mock).mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
    } as never);

    const res = await asAdmin("post", "/api/v1/access-profiles").send({
      name: "Pengamat HR",
      codes: ["employee.view_all"],
    });

    expect(res.status).toBe(409);
    expect(profileModel.createProfile).not.toHaveBeenCalled();
  });

  it("menolak paket yang kehilangan fitur dasarnya", async () => {
    (featureModel.findByCodes as jest.Mock).mockResolvedValue([
      { ...fakeFeature, code: "attendance.correct" },
    ] as never);

    const res = await asAdmin("post", "/api/v1/access-profiles").send({
      name: "Koreksi Saja",
      codes: ["attendance.correct"],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("attendance.view_all");
  });

  it("mengubah isi paket langsung berlaku ke semua jabatan pemakainya", async () => {
    (featureModel.findByCodes as jest.Mock).mockResolvedValue([
      fakeFeature,
      fakeFeatureLeave,
    ] as never);

    const res = await asAdmin(
      "patch",
      `/api/v1/access-profiles/${PROFILE_ID}`,
    ).send({
      codes: ["employee.view_all", "leave.view_all"],
      updated_at: fakeProfile.updated_at,
    });

    expect(res.status).toBe(200);
    expect(profileModel.syncPositions).toHaveBeenCalledWith(
      mockClient,
      PROFILE_ID,
      USER_ID,
    );
    expect(res.body.message).toContain("1 position");
  });

  it("mengubah nama saja tidak menyentuh fitur jabatan", async () => {
    await asAdmin("patch", `/api/v1/access-profiles/${PROFILE_ID}`).send({
      name: "Pengamat HR Pusat",
    });

    expect(profileModel.replaceFeatures).not.toHaveBeenCalled();
    expect(profileModel.syncPositions).not.toHaveBeenCalled();
  });

  it("melaporkan bentrok versi tanpa mengubah jabatan mana pun", async () => {
    (profileModel.updateProfile as jest.Mock).mockResolvedValue(null as never);

    const res = await asAdmin(
      "patch",
      `/api/v1/access-profiles/${PROFILE_ID}`,
    ).send({
      codes: ["employee.view_all"],
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(res.status).toBe(409);
    expect(profileModel.syncPositions).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("tidak menghapus paket standar", async () => {
    (profileModel.findById as jest.Mock).mockResolvedValue({
      ...fakeProfile,
      position_count: 0,
    } as never);

    const res = await asAdmin(
      "delete",
      `/api/v1/access-profiles/${PROFILE_ID}`,
    );

    expect(res.status).toBe(400);
    expect(profileModel.deleteProfile).not.toHaveBeenCalled();
  });

  it("tidak menghapus paket yang masih dipakai jabatan", async () => {
    (profileModel.findById as jest.Mock).mockResolvedValue({
      ...fakeProfile,
      is_system: false,
    } as never);

    const res = await asAdmin(
      "delete",
      `/api/v1/access-profiles/${PROFILE_ID}`,
    );

    expect(res.status).toBe(409);
    expect(res.body.details.position_count).toBe(3);
  });

  it("menghapus paket kustom yang tidak dipakai", async () => {
    (profileModel.findById as jest.Mock).mockResolvedValue({
      ...fakeProfile,
      is_system: false,
      position_count: 0,
    } as never);

    const res = await asAdmin(
      "delete",
      `/api/v1/access-profiles/${PROFILE_ID}`,
    );

    expect(res.status).toBe(200);
    expect(profileModel.deleteProfile).toHaveBeenCalledWith(
      mockClient,
      PROFILE_ID,
    );
  });

  it("memasang paket ke jabatan dan membuang cache fiturnya", async () => {
    await request(app)
      .get("/api/v1/leave-requests/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    const res = await asAdmin(
      "put",
      `/api/v1/positions/${POSITION_ID}/access-profile`,
    ).send({
      access_profile_id: PROFILE_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.access_profile_name).toBe("Pengamat HR");
    expect(res.body.data.codes).toEqual(["employee.view_all"]);
    expect(readFromCache(POSITION_ID)).toBeNull();
  });

  it("access_profile_id null mengembalikan jabatan ke akses swalayan", async () => {
    const res = await asAdmin(
      "put",
      `/api/v1/positions/${POSITION_ID}/access-profile`,
    ).send({
      access_profile_id: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.codes).toEqual([]);
    expect(profileModel.assignToPosition).toHaveBeenCalledWith(
      mockClient,
      POSITION_ID,
      null,
      USER_ID,
      undefined,
    );
  });

  it("menolak paket yang tidak ada", async () => {
    (profileModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await asAdmin(
      "put",
      `/api/v1/positions/${POSITION_ID}/access-profile`,
    ).send({
      access_profile_id: PROFILE_ID,
    });

    expect(res.status).toBe(400);
    expect(profileModel.assignToPosition).not.toHaveBeenCalled();
  });

  it("access_profile_id wajib dikirim, walau bernilai null", async () => {
    const res = await asAdmin(
      "put",
      `/api/v1/positions/${POSITION_ID}/access-profile`,
    ).send({});

    expect(res.status).toBe(400);
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

  it("menyertakan paket akses, paket tiap jabatan, dan tanda fitur", async () => {
    (featureModel.findAllFeatures as jest.Mock).mockResolvedValue([
      fakeFeature,
      {
        ...fakeFeature,
        id: "88888888-8888-4888-8888-888888888888",
        code: "employee.delete",
        name: "Hapus Karyawan",
      },
    ] as never);

    const res = await request(app)
      .get("/api/v1/features/matrix")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.access_profiles[0].name).toBe("Pengamat HR");
    expect(res.body.data.positions[0].access_profile_id).toBe(PROFILE_ID);
    expect(res.body.data.positions[0].holder_count).toBe(3);

    const features = res.body.data.categories[0].features;
    const remove = features.find(
      (f: { code: string }) => f.code === "employee.delete",
    );

    expect(remove.is_sensitive).toBe(true);
    expect(remove.requires).toEqual(["employee.view_all"]);
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
