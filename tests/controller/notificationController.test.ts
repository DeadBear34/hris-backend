import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(() => Promise.resolve(null)),
}));

jest.unstable_mockModule("../../src/models/notification.js", () => ({
  insertMany: jest.fn(),
  listFor: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
  countUnread: jest.fn(),
  deletePending: jest.fn(),
}));

const notificationModel = await import("../../src/models/notification.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { app } = await import("../../src/app.js");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const NOTIF_ID = "33333333-3333-4333-8333-333333333333";

const token = createToken({
  id: USER_ID,
  email: "yusuf@awan.io",
  role: "employee",
});

const fakeNotification = {
  id: NOTIF_ID,
  recipient_user_id: USER_ID,
  type: "leave_approval_needed" as const,
  title: "Pengajuan cuti baru",
  message: "Yusuf mengajukan Cuti Duka 1 hari pada 2027-07-12",
  link: "/leave-management",
  entity: "leave_request",
  entity_id: "44444444-4444-4444-8444-444444444444",
  is_read: false,
  read_at: null,
  created_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/v1/notifications", () => {
  it("menolak permintaan tanpa token", async () => {
    const res = await request(app).get("/api/v1/notifications");

    expect(res.status).toBe(401);
  });

  it("mengembalikan notifikasi milik pengguna yang login", async () => {
    (notificationModel.listFor as jest.Mock).mockResolvedValue({
      rows: [fakeNotification],
      total: 1,
      unread: 1,
    } as never);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Pengajuan cuti baru");
  });

  it("menyaring berdasarkan penerima, bukan parameter dari pengguna", async () => {
    (notificationModel.listFor as jest.Mock).mockResolvedValue({
      rows: [],
      total: 0,
      unread: 0,
    } as never);

    await request(app)
      .get(`/api/v1/notifications?recipient_user_id=${OTHER_ID}`)
      .set("Authorization", `Bearer ${token}`);

    const [params] = (notificationModel.listFor as jest.Mock).mock.calls[0] as [
      { recipient_user_id: string },
    ];

    expect(params.recipient_user_id).toBe(USER_ID);
  });

  it("tidak membocorkan kolom internal ke frontend", async () => {
    (notificationModel.listFor as jest.Mock).mockResolvedValue({
      rows: [fakeNotification],
      total: 1,
      unread: 1,
    } as never);

    const res = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.data[0]).not.toHaveProperty("recipient_user_id");
    expect(res.body.data[0]).not.toHaveProperty("entity");
    expect(res.body.data[0]).not.toHaveProperty("entity_id");
  });

  it("menyertakan jumlah belum dibaca terpisah dari pagination", async () => {
    (notificationModel.listFor as jest.Mock).mockResolvedValue({
      rows: [fakeNotification],
      total: 30,
      unread: 7,
    } as never);

    const res = await request(app)
      .get("/api/v1/notifications?limit=10")
      .set("Authorization", `Bearer ${token}`);

    expect(res.body.meta.unread).toBe(7);
    expect(res.body.meta.total).toBe(30);
    expect(res.body.meta.total_pages).toBe(3);
  });

  it("meneruskan penyaring hanya yang belum dibaca", async () => {
    (notificationModel.listFor as jest.Mock).mockResolvedValue({
      rows: [],
      total: 0,
      unread: 0,
    } as never);

    await request(app)
      .get("/api/v1/notifications?only_unread=true")
      .set("Authorization", `Bearer ${token}`);

    const [params] = (notificationModel.listFor as jest.Mock).mock.calls[0] as [
      { only_unread: boolean },
    ];

    expect(params.only_unread).toBe(true);
  });

  it("menolak batas di luar rentang", async () => {
    const res = await request(app)
      .get("/api/v1/notifications?limit=500")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/notifications/:id/read", () => {
  it("menandai notifikasi sebagai sudah dibaca", async () => {
    (notificationModel.markRead as jest.Mock).mockResolvedValue({
      ...fakeNotification,
      is_read: true,
      read_at: new Date(),
    } as never);
    (notificationModel.countUnread as jest.Mock).mockResolvedValue(0 as never);

    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.is_read).toBe(true);
    expect(res.body.meta.unread).toBe(0);
  });

  it("selalu menyertakan id pengguna saat menandai, supaya milik orang lain tidak tersentuh", async () => {
    (notificationModel.markRead as jest.Mock).mockResolvedValue({
      ...fakeNotification,
      is_read: true,
      read_at: new Date(),
    } as never);
    (notificationModel.countUnread as jest.Mock).mockResolvedValue(0 as never);

    await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set("Authorization", `Bearer ${token}`);

    expect(notificationModel.markRead).toHaveBeenCalledWith(NOTIF_ID, USER_ID);
  });

  it("menjawab 404 kalau bukan miliknya atau sudah dibaca", async () => {
    (notificationModel.markRead as jest.Mock).mockResolvedValue(null as never);

    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("menolak id yang bukan uuid", async () => {
    const res = await request(app)
      .patch("/api/v1/notifications/bukan-uuid/read")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/notifications/read-all", () => {
  it("menandai seluruh notifikasi milik pengguna", async () => {
    (notificationModel.markAllRead as jest.Mock).mockResolvedValue(5 as never);

    const res = await request(app)
      .patch("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.updated).toBe(5);
    expect(res.body.meta.unread).toBe(0);
    expect(notificationModel.markAllRead).toHaveBeenCalledWith(USER_ID);
  });

  it("tidak tertukar dengan rute :id/read", async () => {
    (notificationModel.markAllRead as jest.Mock).mockResolvedValue(0 as never);

    await request(app)
      .patch("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);

    expect(notificationModel.markRead).not.toHaveBeenCalled();
  });
});
