import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findSessionInfo: jest.fn(),
}));

const userModel = await import("../../src/models/user.js");
const { authenticate, authorize } =
  await import("../../src/middlewares/auth.js");
const { createToken } = await import("../../src/helpers/jwt.js");
const { AppError } = await import("../../src/helpers/appError.js");
const { env } = await import("../../src/config/env.js");

type AppErrorType = InstanceType<typeof AppError>;

const payload = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ismail@awan.io",
  role: "hr",
};

const token = createToken(payload);

function siapkanReq(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as Request;
}

function ambilError(next: NextFunction): AppErrorType {
  const [err] = (next as jest.Mock).mock.calls[0] as [AppErrorType];
  return err;
}

describe("authenticate", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);
    next = jest.fn() as unknown as NextFunction;
  });

  it("meneruskan request dengan token yang valid", async () => {
    const req = siapkanReq(`Bearer ${token}`);

    await authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menempelkan data pengguna ke request", async () => {
    const req = siapkanReq(`Bearer ${token}`);

    await authenticate(req, {} as Response, next);

    expect(req.user?.id).toBe(payload.id);
    expect(req.user?.role).toBe("hr");
  });

  it("menolak request tanpa header Authorization", async () => {
    await authenticate(siapkanReq(), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak header tanpa awalan Bearer", async () => {
    await authenticate(siapkanReq(token), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak header Bearer tanpa token", async () => {
    await authenticate(siapkanReq("Bearer "), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak token yang diubah isinya", async () => {
    await authenticate(siapkanReq(`Bearer ${token}x`), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak token yang ditandatangani kunci lain", async () => {
    const tokenPalsu = jwt.sign(payload, "kunci-lain-yang-panjang-sekali-32");

    await authenticate(
      siapkanReq(`Bearer ${tokenPalsu}`),
      {} as Response,
      next,
    );

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak token yang sudah kedaluwarsa", async () => {
    const tokenExpired = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: "-1s",
    });

    await authenticate(
      siapkanReq(`Bearer ${tokenExpired}`),
      {} as Response,
      next,
    );

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("tidak membocorkan alasan teknis kegagalan token", async () => {
    await authenticate(siapkanReq(`Bearer ${token}x`), {} as Response, next);

    expect(ambilError(next).message).toBe(
      "Token tidak valid atau sudah kedaluwarsa",
    );
  });

  it("tidak mengisi req.user saat token ditolak", async () => {
    const req = siapkanReq(`Bearer ${token}x`);

    await authenticate(req, {} as Response, next);

    expect(req.user).toBeUndefined();
  });

  it("tidak memeriksa database jika token sudah ditolak", async () => {
    await authenticate(siapkanReq(`Bearer ${token}x`), {} as Response, next);

    expect(userModel.findSessionInfo).not.toHaveBeenCalled();
  });
});

describe("authenticate terhadap perubahan password", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn() as unknown as NextFunction;
  });

  function sesi(password_changed_at: Date | null) {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: payload.id,
      password_changed_at,
    } as never);
  }

  it("menolak token yang diterbitkan sebelum password diubah", async () => {
    sesi(new Date(Date.now() + 60_000));

    await authenticate(siapkanReq(`Bearer ${token}`), {} as Response, next);

    const err = ambilError(next);

    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("password telah diubah");
  });

  it("tidak mengisi req.user saat sesi sudah dibatalkan", async () => {
    sesi(new Date(Date.now() + 60_000));

    const req = siapkanReq(`Bearer ${token}`);
    await authenticate(req, {} as Response, next);

    expect(req.user).toBeUndefined();
  });

  it("menerima token yang diterbitkan setelah password diubah", async () => {
    sesi(new Date(Date.now() - 60_000));

    await authenticate(siapkanReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menerima token saat password belum pernah diubah", async () => {
    sesi(null);

    await authenticate(siapkanReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menerima token yang diterbitkan pada detik yang sama", async () => {
    sesi(new Date());

    await authenticate(siapkanReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("membiarkan controller menangani user yang sudah dihapus", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);

    await authenticate(siapkanReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("meneruskan error database ke penanganan error", async () => {
    (userModel.findSessionInfo as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    await authenticate(siapkanReq(`Bearer ${token}`), {} as Response, next);

    const [err] = (next as jest.Mock).mock.calls[0] as [Error];

    expect(err.message).toBe("koneksi putus");
  });
});

describe("authorize", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn() as unknown as NextFunction;
  });

  it("meloloskan role yang diizinkan", () => {
    const req = { user: { ...payload, role: "hr" } } as Request;

    authorize("hr", "admin")(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("meloloskan role lain yang juga diizinkan", () => {
    const req = { user: { ...payload, role: "admin" } } as Request;

    authorize("hr", "admin")(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menolak role yang tidak diizinkan dengan status 403", () => {
    const req = { user: { ...payload, role: "employee" } } as Request;

    authorize("hr", "admin")(req, {} as Response, next);

    const err = ambilError(next);

    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("menolak request yang belum melewati authenticate", () => {
    authorize("hr")({} as Request, {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak semua role jika daftar izin kosong", () => {
    const req = { user: { ...payload, role: "admin" } } as Request;

    authorize()(req, {} as Response, next);

    expect(ambilError(next).statusCode).toBe(403);
  });

  it("membedakan role secara persis, bukan sebagian kata", () => {
    const req = { user: { ...payload, role: "hrd" } } as Request;

    authorize("hr")(req, {} as Response, next);

    expect(ambilError(next).statusCode).toBe(403);
  });
});
