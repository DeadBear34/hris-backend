import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockUploadPhoto = jest.fn();
const mockDeletePhoto = jest.fn();
const mockStorageConfigured = jest.fn();

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
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
  findDetailById: jest.fn(),
  listEmployees: jest.fn(),
  updatePhotoPath: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/feature.js", () => ({
  findCodesByPosition: jest.fn(),
  findAllCodes: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/featureCache.js", () => ({
  ambilDariCache: jest.fn(() => undefined),
  simpanKeCache: jest.fn(),
  batalkanCacheFitur: jest.fn(),
  ukuranCacheFitur: jest.fn(() => 0),
}));

jest.unstable_mockModule("../../src/helpers/storage.js", () => ({
  isStorageConfigured: mockStorageConfigured,
  uploadPhoto: mockUploadPhoto,
  deletePhoto: mockDeletePhoto,
  buildPhotoPath: (id: string, mime: string) =>
    `${id}/foto.${mime.split("/")[1]}`,
  photoUrlFor: (path: string | null) =>
    path ? `https://contoh.supabase.co/storage/v1/object/public/${path}` : null,
  uploadAttachment: jest.fn(),
  createSignedUrl: jest.fn(),
  buildStoragePath: jest.fn(),
  checksumOf: jest.fn(),
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const employeeModel = await import("../../src/models/employee.js");
const featureModel = await import("../../src/models/feature.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const POSITION_ID = "33333333-3333-4333-8333-333333333333";
const LAIN_ID = "44444444-4444-4444-8444-444444444444";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const BUKAN_GAMBAR = Buffer.from("halo ini teks biasa, bukan gambar");

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  employee_number: "001",
  full_name: "Bagus Pratama",
  position_id: POSITION_ID,
  photo_path: null as string | null,
  is_active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStorageConfigured.mockReturnValue(true as never);
  mockUploadPhoto.mockResolvedValue(undefined as never);
  mockDeletePhoto.mockResolvedValue(undefined as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (employeeModel.findById as jest.Mock).mockResolvedValue({
    ...fakeEmployee,
    id: LAIN_ID,
    full_name: "Sari Utami",
  } as never);
  (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue([
    "employee.update",
  ] as never);
  (employeeModel.updatePhotoPath as jest.Mock).mockImplementation(
    (id, photo_path) =>
      Promise.resolve({ ...fakeEmployee, id, photo_path }) as never,
  );
});

function unggahSendiri(buffer: Buffer, field = "photo", nama = "foto.jpg") {
  return request(app)
    .post("/api/v1/auth/me/photo")
    .set("Authorization", `Bearer ${employeeToken}`)
    .attach(field, buffer, nama);
}

describe("unggah foto profil sendiri", () => {
  it("menolak tamu yang belum login", async () => {
    const res = await request(app)
      .post("/api/v1/auth/me/photo")
      .attach("photo", JPEG, "foto.jpg");

    expect(res.status).toBe(401);
  });

  it("tidak memerlukan fitur apa pun karena mengurus dirinya sendiri", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await unggahSendiri(JPEG);

    expect(res.status).toBe(200);
  });

  it("menyimpan foto lalu mengembalikan tautan publiknya", async () => {
    const res = await unggahSendiri(JPEG);

    expect(res.status).toBe(200);
    expect(mockUploadPhoto).toHaveBeenCalledWith(
      `${EMPLOYEE_ID}/foto.jpeg`,
      expect.any(Buffer),
      "image/jpeg",
    );
    expect(res.body.data.photo_url).toContain(`${EMPLOYEE_ID}/foto.jpeg`);
  });

  it("mencatat jalur foto pada data karyawan", async () => {
    await unggahSendiri(PNG);

    expect(employeeModel.updatePhotoPath).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      `${EMPLOYEE_ID}/foto.png`,
    );
  });

  it("menentukan jenis berkas dari isinya, bukan dari nama berkasnya", async () => {
    const res = await unggahSendiri(PNG, "photo", "tipuan.jpg");

    expect(res.status).toBe(200);
    expect(mockUploadPhoto).toHaveBeenCalledWith(
      expect.stringContaining(".png"),
      expect.any(Buffer),
      "image/png",
    );
  });

  it("menolak berkas yang bukan gambar", async () => {
    const res = await unggahSendiri(BUKAN_GAMBAR, "photo", "virus.jpg");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("JPEG, PNG, atau WebP");
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it("menolak permintaan tanpa berkas", async () => {
    const res = await request(app)
      .post("/api/v1/auth/me/photo")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("field 'photo'");
  });

  it("menolak berkas yang dikirim pada field yang salah", async () => {
    const res = await unggahSendiri(JPEG, "file");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("photo");
  });

  it("menolak akun yang belum terhubung ke data karyawan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue(null as never);

    const res = await unggahSendiri(JPEG);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum terhubung ke data karyawan");
  });

  it("memberi tahu ketika penyimpanan belum dikonfigurasi", async () => {
    mockStorageConfigured.mockReturnValue(false as never);

    const res = await unggahSendiri(JPEG);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum dikonfigurasi");
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it("menghapus foto lama setelah foto baru tersimpan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      photo_path: `${EMPLOYEE_ID}/lama.jpg`,
    } as never);

    await unggahSendiri(JPEG);

    expect(mockDeletePhoto).toHaveBeenCalledWith(`${EMPLOYEE_ID}/lama.jpg`);
  });

  it("tetap berhasil meski foto lama gagal dihapus", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      photo_path: `${EMPLOYEE_ID}/lama.jpg`,
    } as never);
    mockDeletePhoto.mockRejectedValue(new Error("berkas hilang") as never);

    const res = await unggahSendiri(JPEG);

    expect(res.status).toBe(200);
  });

  it("tidak mencoba menghapus apa pun bila belum punya foto", async () => {
    await unggahSendiri(JPEG);

    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });
});

describe("hapus foto profil sendiri", () => {
  function hapus() {
    return request(app)
      .delete("/api/v1/auth/me/photo")
      .set("Authorization", `Bearer ${employeeToken}`);
  }

  it("mengosongkan jalur foto lalu menghapus berkasnya", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      photo_path: `${EMPLOYEE_ID}/lama.jpg`,
    } as never);

    const res = await hapus();

    expect(res.status).toBe(200);
    expect(employeeModel.updatePhotoPath).toHaveBeenCalledWith(
      EMPLOYEE_ID,
      null,
    );
    expect(mockDeletePhoto).toHaveBeenCalledWith(`${EMPLOYEE_ID}/lama.jpg`);
  });

  it("menolak ketika memang belum punya foto", async () => {
    const res = await hapus();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum memiliki foto profil");
    expect(employeeModel.updatePhotoPath).not.toHaveBeenCalled();
  });
});

describe("foto profil karyawan lain", () => {
  function unggahLain() {
    return request(app)
      .post(`/api/v1/employees/${LAIN_ID}/photo`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .attach("photo", JPEG, "foto.jpg");
  }

  it("menolak tanpa fitur employee.update", async () => {
    (featureModel.findCodesByPosition as jest.Mock).mockResolvedValue(
      [] as never,
    );

    const res = await unggahLain();

    expect(res.status).toBe(403);
    expect(res.body.details.required_feature).toBe("employee.update");
  });

  it("mengizinkan pemegang employee.update", async () => {
    const res = await unggahLain();

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Sari Utami");
    expect(mockUploadPhoto).toHaveBeenCalledWith(
      `${LAIN_ID}/foto.jpeg`,
      expect.any(Buffer),
      "image/jpeg",
    );
  });

  it("melaporkan karyawan yang tidak ditemukan", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await unggahLain();

    expect(res.status).toBe(404);
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .post("/api/v1/employees/bukan-uuid/photo")
      .set("Authorization", `Bearer ${employeeToken}`)
      .attach("photo", JPEG, "foto.jpg");

    expect(res.status).toBe(400);
  });

  it("menghapus foto karyawan lain", async () => {
    (employeeModel.findById as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
      full_name: "Sari Utami",
      photo_path: `${LAIN_ID}/lama.jpg`,
    } as never);

    const res = await request(app)
      .delete(`/api/v1/employees/${LAIN_ID}/photo`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(employeeModel.updatePhotoPath).toHaveBeenCalledWith(LAIN_ID, null);
  });
});
