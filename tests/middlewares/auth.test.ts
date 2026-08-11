import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authenticate, authorize } from "../../src/middlewares/auth.js";
import { createToken } from "../../src/helpers/jwt.js";
import { AppError } from "../../src/helpers/appError.js";
import { env } from "../../src/config/env.js";

const payload = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ismail@awan.io",
  role: "hr",
};

const token = createToken(payload);

function siapkanReq(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as Request;
}

function ambilError(next: NextFunction): AppError {
  const [err] = (next as jest.Mock).mock.calls[0] as [AppError];
  return err;
}

describe("authenticate", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn() as unknown as NextFunction;
  });

  it("meneruskan request dengan token yang valid", () => {
    const req = siapkanReq(`Bearer ${token}`);

    authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("menempelkan data pengguna ke request", () => {
    const req = siapkanReq(`Bearer ${token}`);

    authenticate(req, {} as Response, next);

    expect(req.user?.id).toBe(payload.id);
    expect(req.user?.role).toBe("hr");
  });

  it("menolak request tanpa header Authorization", () => {
    authenticate(siapkanReq(), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak header tanpa awalan Bearer", () => {
    authenticate(siapkanReq(token), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak header Bearer tanpa token", () => {
    authenticate(siapkanReq("Bearer "), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak token yang diubah isinya", () => {
    authenticate(siapkanReq(`Bearer ${token}x`), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak token yang ditandatangani kunci lain", () => {
    const tokenPalsu = jwt.sign(payload, "kunci-lain-yang-panjang-sekali-32");

    authenticate(siapkanReq(`Bearer ${tokenPalsu}`), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("menolak token yang sudah kedaluwarsa", () => {
    const tokenExpired = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: "-1s",
    });

    authenticate(siapkanReq(`Bearer ${tokenExpired}`), {} as Response, next);

    expect(ambilError(next).statusCode).toBe(401);
  });

  it("tidak membocorkan alasan teknis kegagalan token", () => {
    authenticate(siapkanReq(`Bearer ${token}x`), {} as Response, next);

    expect(ambilError(next).message).toBe(
      "Token tidak valid atau sudah kedaluwarsa",
    );
  });

  it("tidak mengisi req.user saat token ditolak", () => {
    const req = siapkanReq(`Bearer ${token}x`);

    authenticate(req, {} as Response, next);

    expect(req.user).toBeUndefined();
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
