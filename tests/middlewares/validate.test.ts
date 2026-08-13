import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { ZodError, z } from "zod";
import {
  validate,
  validateQuery,
  validateParams,
} from "../../src/middlewares/validate.js";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  page: z.coerce.number().default(1),
});

function siapkanRes() {
  return { locals: {} } as unknown as Response;
}

describe("validate", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn() as unknown as NextFunction;
  });

  it("meneruskan request yang lolos validasi", () => {
    const req = { body: { email: "ismail@awan.io" } } as Request;

    validate(schema)(req, siapkanRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it("mengganti body dengan hasil parsing", () => {
    const req = { body: { email: "  Ismail@Awan.IO  " } } as Request;

    validate(schema)(req, siapkanRes(), next);

    expect(req.body.email).toBe("ismail@awan.io");
  });

  it("mengisi nilai bawaan ke dalam body", () => {
    const req = { body: { email: "ismail@awan.io" } } as Request;

    validate(schema)(req, siapkanRes(), next);

    expect(req.body.page).toBe(1);
  });

  it("membuang field yang tidak ada di skema", () => {
    const req = {
      body: { email: "ismail@awan.io", role: "admin" },
    } as Request;

    validate(schema)(req, siapkanRes(), next);

    expect(req.body).not.toHaveProperty("role");
  });

  it("meneruskan ZodError ke penanganan error saat validasi gagal", () => {
    const req = { body: { email: "bukanemail" } } as Request;

    validate(schema)(req, siapkanRes(), next);

    const [err] = (next as jest.Mock).mock.calls[0] as [unknown];

    expect(err).toBeInstanceOf(ZodError);
  });

  it("tidak mengubah body saat validasi gagal", () => {
    const req = { body: { email: "bukanemail" } } as Request;

    validate(schema)(req, siapkanRes(), next);

    expect(req.body).toEqual({ email: "bukanemail" });
  });

  it("hanya memanggil next satu kali saat validasi gagal", () => {
    const req = { body: {} } as Request;

    validate(schema)(req, siapkanRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("validateQuery", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn() as unknown as NextFunction;
  });

  it("menyimpan hasil parsing ke res.locals.query", () => {
    const req = {
      query: { email: "ismail@awan.io", page: "3" },
    } as unknown as Request;
    const res = siapkanRes();

    validateQuery(schema)(req, res, next);

    expect(res.locals.query).toEqual({ email: "ismail@awan.io", page: 3 });
  });

  it("tidak menimpa req.query", () => {
    const query = { email: "ismail@awan.io" };
    const req = { query } as unknown as Request;

    validateQuery(schema)(req, siapkanRes(), next);

    expect(req.query).toBe(query);
  });

  it("meneruskan ZodError saat query tidak valid", () => {
    const req = { query: { email: "bukanemail" } } as unknown as Request;
    const res = siapkanRes();

    validateQuery(schema)(req, res, next);

    const [err] = (next as jest.Mock).mock.calls[0] as [unknown];

    expect(err).toBeInstanceOf(ZodError);
    expect(res.locals.query).toBeUndefined();
  });
});

describe("validateParams", () => {
  const paramSchema = z.object({ id: z.uuid() });
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn() as unknown as NextFunction;
  });

  it("menyimpan hasil parsing ke res.locals.params", () => {
    const req = { params: { id: VALID_UUID } } as unknown as Request;
    const res = siapkanRes();

    validateParams(paramSchema)(req, res, next);

    expect(res.locals.params).toEqual({ id: VALID_UUID });
    expect(next).toHaveBeenCalledWith();
  });

  it("meneruskan ZodError saat parameter tidak valid", () => {
    const req = { params: { id: "123" } } as unknown as Request;
    const res = siapkanRes();

    validateParams(paramSchema)(req, res, next);

    const [err] = (next as jest.Mock).mock.calls[0] as [unknown];

    expect(err).toBeInstanceOf(ZodError);
    expect(res.locals.params).toBeUndefined();
  });
});
