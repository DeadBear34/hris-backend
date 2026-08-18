import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

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
}));

jest.unstable_mockModule("../../src/models/leaveRequest.js", () => ({
  findById: jest.fn(),
  findDetailById: jest.fn(),
  listRequests: jest.fn(),
  findOverlapping: jest.fn(),
  createRequest: jest.fn(),
  approveRequest: jest.fn(),
  rejectRequest: jest.fn(),
  cancelRequest: jest.fn(),
}));

jest.unstable_mockModule("../../src/models/leaveAttachment.js", () => ({
  createAttachment: jest.fn(),
  findById: jest.fn(),
  findByRequest: jest.fn(),
  countByRequest: jest.fn(),
}));

const mockUpload = jest.fn(() => Promise.resolve());
const mockSignedUrl = jest.fn();
const mockStorageConfigured = jest.fn(() => true);

jest.unstable_mockModule("../../src/helpers/storage.js", () => ({
  uploadAttachment: mockUpload,
  createSignedUrl: mockSignedUrl,
  isStorageConfigured: mockStorageConfigured,
  buildStoragePath: (id: string, mime: string) =>
    `${id}/berkas.${mime.split("/")[1]}`,
  checksumOf: () => "checksum-palsu",
}));

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const userModel = await import("../../src/models/user.js");
const employeeModel = await import("../../src/models/employee.js");
const leaveRequestModel = await import("../../src/models/leaveRequest.js");
const attachmentModel = await import("../../src/models/leaveAttachment.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const MANAGER_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const ATTACHMENT_ID = "55555555-5555-4555-8555-555555555555";
const LAIN_ID = "66666666-6666-4666-8666-666666666666";

const employeeToken = createToken({
  id: USER_ID,
  email: "karyawan@awan.io",
  role: "employee",
});
const adminToken = createToken({
  id: USER_ID,
  email: "admin2@awan.io",
  role: "admin",
});

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

const fakeEmployee = {
  id: EMPLOYEE_ID,
  user_id: USER_ID,
  full_name: "Ismail Muhammad",
  gender: "male",
  manager_id: MANAGER_ID,
};

const fakeRequest = {
  id: REQUEST_ID,
  employee_id: EMPLOYEE_ID,
  approver_id: MANAGER_ID,
  leave_type_id: "77777777-7777-4777-8777-777777777777",
  status: "pending",
  total_days: 3,
};

const fakeAttachment = {
  id: ATTACHMENT_ID,
  leave_request_id: REQUEST_ID,
  storage_path: `${REQUEST_ID}/berkas.jpg`,
  file_name: "surat-dokter.jpg",
  mime_type: "image/jpeg",
  file_size: 68,
  checksum: "checksum-palsu",
  uploaded_by: EMPLOYEE_ID,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue(undefined as never);
  mockStorageConfigured.mockReturnValue(true);
  mockSignedUrl.mockResolvedValue({
    url: "https://storage.test/signed",
    expires_in: 900,
  } as never);
  (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
  (employeeModel.findByUserId as jest.Mock).mockResolvedValue(
    fakeEmployee as never,
  );
  (leaveRequestModel.findById as jest.Mock).mockResolvedValue(
    fakeRequest as never,
  );
  (attachmentModel.createAttachment as jest.Mock).mockResolvedValue(
    fakeAttachment as never,
  );
  (attachmentModel.findById as jest.Mock).mockResolvedValue(
    fakeAttachment as never,
  );
  (attachmentModel.findByRequest as jest.Mock).mockResolvedValue([
    fakeAttachment,
  ] as never);
});

function unggah(buffer: Buffer, nama = "bukti.jpg", token = employeeToken) {
  return request(app)
    .post(`/api/v1/leave-requests/${REQUEST_ID}/attachments`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, nama);
}

describe("POST /api/v1/leave-requests/:id/attachments", () => {
  it("menolak request tanpa token", async () => {
    const res = await request(app)
      .post(`/api/v1/leave-requests/${REQUEST_ID}/attachments`)
      .attach("file", JPEG, "bukti.jpg");

    expect(res.status).toBe(401);
  });

  it("mengunggah gambar JPEG yang sah", async () => {
    const res = await unggah(JPEG);

    expect(res.status).toBe(201);
    expect(mockUpload).toHaveBeenCalled();
  });

  it("mengunggah gambar PNG yang sah", async () => {
    const res = await unggah(PNG, "bukti.png");

    expect(res.status).toBe(201);
  });

  it("menolak berkas yang bukan gambar meski ekstensinya jpg", async () => {
    const res = await unggah(Buffer.from("%PDF-1.7 palsu"), "bukti.jpg");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("JPEG, PNG, atau WebP");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("menolak skrip yang menyamar sebagai gambar", async () => {
    const res = await unggah(Buffer.from("<?php echo 1; ?>"), "bukti.png");

    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("menentukan tipe dari isi berkas, bukan dari nama berkas", async () => {
    await unggah(PNG, "bukti.jpg");

    const [data] = (attachmentModel.createAttachment as jest.Mock).mock
      .calls[0] as [{ mime_type: string }];

    expect(data.mime_type).toBe("image/png");
  });

  it("menyimpan nama berkas yang dibuat ulang, bukan nama asli", async () => {
    await unggah(JPEG, "../../etc/passwd.jpg");

    const [data] = (attachmentModel.createAttachment as jest.Mock).mock
      .calls[0] as [{ storage_path: string; file_name: string }];
    expect(data.storage_path).toBe(`${REQUEST_ID}/berkas.jpeg`);
    expect(data.storage_path).not.toContain("..");
    expect(data.file_name).not.toContain("..");
  });

  it("mencatat checksum berkas", async () => {
    await unggah(JPEG);

    const [data] = (attachmentModel.createAttachment as jest.Mock).mock
      .calls[0] as [{ checksum: string }];

    expect(data.checksum).toBe("checksum-palsu");
  });

  it("mengembalikan 404 jika pengajuan tidak ada", async () => {
    (leaveRequestModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await unggah(JPEG);

    expect(res.status).toBe(404);
  });

  it("menolak pengguna yang tidak berkepentingan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
    } as never);

    const res = await unggah(JPEG);

    expect(res.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("mengizinkan penyetuju yang ditugaskan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: MANAGER_ID,
    } as never);

    const res = await unggah(JPEG);

    expect(res.status).toBe(201);
  });

  it("mengizinkan admin", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
    } as never);

    const res = await unggah(JPEG, "bukti.jpg", adminToken);

    expect(res.status).toBe(201);
  });

  it("menolak permintaan tanpa berkas", async () => {
    const res = await request(app)
      .post(`/api/v1/leave-requests/${REQUEST_ID}/attachments`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .field("catatan", "tanpa berkas");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("wajib diunggah");
  });

  it("menolak berkas pada field selain file", async () => {
    const res = await request(app)
      .post(`/api/v1/leave-requests/${REQUEST_ID}/attachments`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .attach("gambar", JPEG, "bukti.jpg");

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("field 'file'");
  });

  it("menolak unggahan saat penyimpanan belum dikonfigurasi", async () => {
    mockStorageConfigured.mockReturnValue(false);

    const res = await unggah(JPEG);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("belum dikonfigurasi");
  });

  it("tidak menyimpan metadata jika unggahan ke storage gagal", async () => {
    mockUpload.mockRejectedValue(new Error("bucket penuh") as never);

    const res = await unggah(JPEG);

    expect(res.status).toBe(500);
    expect(attachmentModel.createAttachment).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/leave-requests/:id/attachments", () => {
  it("menampilkan lampiran milik pengajuan", async () => {
    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}/attachments`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("menolak pengguna yang tidak berkepentingan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
    } as never);

    const res = await request(app)
      .get(`/api/v1/leave-requests/${REQUEST_ID}/attachments`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/leave-attachments/:id/url", () => {
  function ambilUrl(token = employeeToken) {
    return request(app)
      .get(`/api/v1/leave-attachments/${ATTACHMENT_ID}/url`)
      .set("Authorization", `Bearer ${token}`);
  }

  it("menerbitkan signed URL baru setiap kali diminta", async () => {
    const res = await ambilUrl();

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe("https://storage.test/signed");
    expect(mockSignedUrl).toHaveBeenCalledWith(fakeAttachment.storage_path);
  });

  it("menyebutkan masa berlaku lima belas menit", async () => {
    const res = await ambilUrl();

    expect(res.body.data.expires_in).toBe(900);
  });

  it("tidak membocorkan jalur penyimpanan ke klien", async () => {
    const res = await ambilUrl();

    expect(JSON.stringify(res.body)).not.toContain("storage_path");
  });

  it("mengembalikan 404 jika lampiran tidak ada", async () => {
    (attachmentModel.findById as jest.Mock).mockResolvedValue(null as never);

    const res = await ambilUrl();

    expect(res.status).toBe(404);
  });

  it("menolak pengguna yang tidak berkepentingan", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
    } as never);

    const res = await ambilUrl();

    expect(res.status).toBe(403);
    expect(mockSignedUrl).not.toHaveBeenCalled();
  });

  it("mengizinkan admin melihat lampiran siapa pun", async () => {
    (employeeModel.findByUserId as jest.Mock).mockResolvedValue({
      ...fakeEmployee,
      id: LAIN_ID,
    } as never);

    const res = await ambilUrl(adminToken);

    expect(res.status).toBe(200);
  });
});
