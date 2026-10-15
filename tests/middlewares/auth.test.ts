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
const { revokeToken, resetRevokedTokens } =
  await import("../../src/helpers/sessionStore.js");
const { AppError } = await import("../../src/helpers/appError.js");
const { env } = await import("../../src/config/env.js");

type AppErrorType = InstanceType<typeof AppError>;

const payload = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ismail@awan.io",
  role: "admin",
};

const token = createToken(payload);

function makeReq(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as Request;
}

function captureError(next: NextFunction): AppErrorType {
  const [err] = (next as jest.Mock).mock.calls[0] as [AppErrorType];
  return err;
}

describe("authenticate", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: payload.id,
      password_changed_at: null,
      is_active: true,
    } as never);
    next = jest.fn() as unknown as NextFunction;
  });

  it("meneruskan request dengan token yang valid", async () => {
    const req = makeReq(`Bearer ${token}`);

    await authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menempelkan data pengguna ke request", async () => {
    const req = makeReq(`Bearer ${token}`);

    await authenticate(req, {} as Response, next);

    expect(req.user?.id).toBe(payload.id);
    expect(req.user?.role).toBe("admin");
  });

  it("menolak request tanpa header Authorization", async () => {
    await authenticate(makeReq(), {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("menolak header tanpa awalan Bearer", async () => {
    await authenticate(makeReq(token), {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("menolak header Bearer tanpa token", async () => {
    await authenticate(makeReq("Bearer "), {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("menolak token yang diubah isinya", async () => {
    await authenticate(makeReq(`Bearer ${token}x`), {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("menolak token yang ditandatangani kunci lain", async () => {
    const forgedToken = jwt.sign(payload, "kunci-lain-yang-panjang-sekali-32");

    await authenticate(makeReq(`Bearer ${forgedToken}`), {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("menolak token yang sudah kedaluwarsa", async () => {
    const tokenExpired = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: "-1s",
    });

    await authenticate(makeReq(`Bearer ${tokenExpired}`), {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("tidak membocorkan alasan teknis kegagalan token", async () => {
    await authenticate(makeReq(`Bearer ${token}x`), {} as Response, next);

    expect(captureError(next).message).toBe("Token is invalid or has expired");
  });

  it("tidak mengisi req.user saat token ditolak", async () => {
    const req = makeReq(`Bearer ${token}x`);

    await authenticate(req, {} as Response, next);

    expect(req.user).toBeUndefined();
  });

  it("tidak memeriksa database jika token sudah ditolak", async () => {
    await authenticate(makeReq(`Bearer ${token}x`), {} as Response, next);

    expect(userModel.findSessionInfo).not.toHaveBeenCalled();
  });
});

describe("authenticate terhadap perubahan password", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn() as unknown as NextFunction;
  });

  function session(password_changed_at: Date | null) {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: payload.id,
      password_changed_at,
      is_active: true,
    } as never);
  }

  it("menolak token yang diterbitkan sebelum password diubah", async () => {
    session(new Date(Date.now() + 60_000));

    await authenticate(makeReq(`Bearer ${token}`), {} as Response, next);

    const err = captureError(next);

    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("password was changed");
  });

  it("tidak mengisi req.user saat sesi sudah dibatalkan", async () => {
    session(new Date(Date.now() + 60_000));

    const req = makeReq(`Bearer ${token}`);
    await authenticate(req, {} as Response, next);

    expect(req.user).toBeUndefined();
  });

  it("menerima token yang diterbitkan setelah password diubah", async () => {
    session(new Date(Date.now() - 60_000));

    await authenticate(makeReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menerima token saat password belum pernah diubah", async () => {
    session(null);

    await authenticate(makeReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menerima token yang diterbitkan pada detik yang sama", async () => {
    const { iat } = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64").toString(),
    ) as { iat: number };

    session(new Date(iat * 1000));

    await authenticate(makeReq(`Bearer ${token}`), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  // Sebelumnya token milik akun yang sudah dihapus tetap diloloskan sampai
  // kedaluwarsa
  it("menolak token milik akun yang sudah dihapus", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue(null as never);

    const req = makeReq(`Bearer ${token}`);
    await authenticate(req, {} as Response, next);

    const err = captureError(next);

    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("no longer exists");
    expect(req.user).toBeUndefined();
  });

  it("menolak token milik akun yang dinonaktifkan admin", async () => {
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: payload.id,
      password_changed_at: null,
      is_active: false,
    } as never);

    await authenticate(makeReq(`Bearer ${token}`), {} as Response, next);

    const err = captureError(next);

    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("deactivated");
  });

  it("meneruskan error database ke penanganan error", async () => {
    (userModel.findSessionInfo as jest.Mock).mockRejectedValue(
      new Error("koneksi putus") as never,
    );

    await authenticate(makeReq(`Bearer ${token}`), {} as Response, next);

    const [err] = (next as jest.Mock).mock.calls[0] as [Error];

    expect(err.message).toBe("koneksi putus");
  });
});

describe("authenticate setelah logout", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRevokedTokens();
    (userModel.findSessionInfo as jest.Mock).mockResolvedValue({
      id: payload.id,
      password_changed_at: null,
      is_active: true,
    } as never);
    next = jest.fn() as unknown as NextFunction;
  });

  function decode(raw: string) {
    return jwt.decode(raw) as {
      id: string;
      email: string;
      role: string;
      jti?: string;
      iat: number;
      exp: number;
    };
  }

  it("setiap token membawa jti yang unik", () => {
    const first = decode(createToken(payload));
    const second = decode(createToken(payload));

    expect(first.jti).toBeDefined();
    expect(first.jti).not.toBe(second.jti);
  });

  it("menolak token yang sudah dicabut lewat logout", async () => {
    const own = createToken(payload);
    await revokeToken(decode(own));

    const req = makeReq(`Bearer ${own}`);
    await authenticate(req, {} as Response, next);

    const err = captureError(next);

    expect(err.statusCode).toBe(401);
    expect(err.message).toContain("logged out");
    expect(req.user).toBeUndefined();
    // token yang sudah dicabut tidak perlu membaca data sesi lagi
    expect(userModel.findSessionInfo).not.toHaveBeenCalled();
  });

  it("token lain milik pengguna yang sama tetap berlaku", async () => {
    await revokeToken(decode(createToken(payload)));

    await authenticate(
      makeReq(`Bearer ${createToken(payload)}`),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });
});

describe("authorize", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn() as unknown as NextFunction;
  });

  it("meloloskan role yang diizinkan", () => {
    const req = { user: { ...payload, role: "admin" } } as Request;

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

    const err = captureError(next);

    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("menolak request yang belum melewati authenticate", () => {
    authorize("admin")({} as Request, {} as Response, next);

    expect(captureError(next).statusCode).toBe(401);
  });

  it("menolak semua role jika daftar izin kosong", () => {
    const req = { user: { ...payload, role: "admin" } } as Request;

    authorize()(req, {} as Response, next);

    expect(captureError(next).statusCode).toBe(403);
  });

  it("membedakan role secara persis, bukan sebagian kata", () => {
    const req = { user: { ...payload, role: "hrd" } } as Request;

    authorize("admin")(req, {} as Response, next);

    expect(captureError(next).statusCode).toBe(403);
  });
});
