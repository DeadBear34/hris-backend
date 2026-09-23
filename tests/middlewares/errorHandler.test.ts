import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

const mockLoggerError = jest.fn();

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: { error: mockLoggerError, info: jest.fn(), warn: jest.fn() },
}));

const { errorHandler, notFoundHandler } =
  await import("../../src/middlewares/errorHandler.js");
const { AppError, BadRequest, NotFound, Conflict } =
  await import("../../src/helpers/appError.js");

interface ResponseResult {
  status: number;
  body: Record<string, unknown>;
}

function makeRes(result: ResponseResult) {
  const res = {
    status(code: number) {
      result.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      result.body = body;
      return res;
    },
  };

  return res as unknown as Response;
}

function runHandler(err: unknown): ResponseResult {
  const result: ResponseResult = { status: 200, body: {} };

  errorHandler(
    err,
    {} as Request,
    makeRes(result),
    jest.fn() as unknown as NextFunction,
  );

  return result;
}

function makeZodError() {
  const schema = z.object({
    email: z.email("Invalid email format"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  });

  const result = schema.safeParse({ email: "bukanemail", password: "abc" });

  if (result.success) throw new Error("skema seharusnya gagal");

  return result.error;
}

describe("notFoundHandler", () => {
  it("mengembalikan status 404", () => {
    const result: ResponseResult = { status: 200, body: {} };

    notFoundHandler(
      { method: "GET", originalUrl: "/api/v1/tidakada" } as Request,
      makeRes(result),
    );

    expect(result.status).toBe(404);
  });

  it("menyebutkan metode dan alamat yang diminta", () => {
    const result: ResponseResult = { status: 200, body: {} };

    notFoundHandler(
      { method: "POST", originalUrl: "/api/v1/tidakada" } as Request,
      makeRes(result),
    );

    expect(result.body.success).toBe(false);
    expect(result.body.message).toContain("POST");
    expect(result.body.message).toContain("/api/v1/tidakada");
  });
});

describe("errorHandler untuk error validasi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan status 400", () => {
    const result = runHandler(makeZodError());

    expect(result.status).toBe(400);
  });

  it("memakai kode VALIDATION_ERROR", () => {
    const result = runHandler(makeZodError());

    expect(result.body.code).toBe("VALIDATION_ERROR");
    expect(result.body.success).toBe(false);
  });

  it("merinci setiap field yang bermasalah", () => {
    const result = runHandler(makeZodError());
    const errors = result.body.errors as { field: string; message: string }[];

    expect(errors.map((e) => e.field)).toEqual(["email", "password"]);
  });

  it("menyertakan pesan kesalahan tiap field", () => {
    const result = runHandler(makeZodError());
    const errors = result.body.errors as { field: string; message: string }[];

    expect(errors[0]?.message).toBe("Invalid email format");
  });

  it("tidak mencatat error validasi ke log", () => {
    runHandler(makeZodError());

    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});

describe("errorHandler untuk JSON yang rusak", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan status 400 dengan kode INVALID_JSON", () => {
    const err = new SyntaxError("Unexpected token } in JSON");
    Object.assign(err, { body: "{rusak" });

    const result = runHandler(err);

    expect(result.status).toBe(400);
    expect(result.body.code).toBe("INVALID_JSON");
  });

  it("memperlakukan SyntaxError biasa sebagai error server", () => {
    const result = runHandler(new SyntaxError("kesalahan lain"));

    expect(result.status).toBe(500);
  });
});

describe("errorHandler untuk data kembar dari database", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengubah pelanggaran UNIQUE menjadi 409", () => {
    const err = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });

    const result = runHandler(err);

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("CONFLICT");
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("tetap memperlakukan error database lain sebagai error server", () => {
    const err = Object.assign(new Error("connection lost"), { code: "08006" });

    const result = runHandler(err);

    expect(result.status).toBe(500);
  });
});

describe("errorHandler untuk AppError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("memakai status dan kode dari error yang dilempar", () => {
    const result = runHandler(NotFound("Employee not found"));

    expect(result.status).toBe(404);
    expect(result.body.code).toBe("NOT_FOUND");
    expect(result.body.message).toBe("Employee not found");
  });

  it("meneruskan status konflik", () => {
    const result = runHandler(Conflict("Email is already registered"));

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("CONFLICT");
  });

  it("menyertakan detail tambahan jika tersedia", () => {
    const result = runHandler(
      BadRequest("Masih punya bawahan", { subordinates: [{ id: "1" }] }),
    );

    expect(result.status).toBe(400);
    expect(result.body.details).toEqual({ subordinates: [{ id: "1" }] });
  });

  it("tidak menyertakan properti details jika tidak ada", () => {
    const result = runHandler(BadRequest("Invalid request"));

    expect(result.body).not.toHaveProperty("details");
  });

  it("meneruskan status khusus yang ditulis manual", () => {
    const result = runHandler(new AppError(418, "Teko kopi", "TEAPOT"));

    expect(result.status).toBe(418);
    expect(result.body.code).toBe("TEAPOT");
  });

  it("tidak mencatat AppError ke log karena sudah ditangani", () => {
    runHandler(NotFound());

    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});

describe("errorHandler untuk error tak terduga", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan status 500", () => {
    const result = runHandler(new Error("relation users does not exist"));

    expect(result.status).toBe(500);
    expect(result.body.success).toBe(false);
  });

  it("tidak membocorkan pesan asli error", () => {
    const result = runHandler(new Error("relation users does not exist"));

    expect(result.body.message).toBe("An error occurred on the server");
  });

  it("tidak menyertakan stack trace dalam respons", () => {
    const result = runHandler(new Error("gagal"));

    expect(result.body).not.toHaveProperty("stack");
  });

  it("mencatat error ke log agar bisa ditelusuri", () => {
    const err = new Error("gagal");

    runHandler(err);

    expect(mockLoggerError).toHaveBeenCalledWith(err);
  });

  it("menangani nilai yang dilempar selain Error", () => {
    const result = runHandler("kesalahan berupa teks");

    expect(result.status).toBe(500);
    expect(result.body.message).toBe("An error occurred on the server");
  });
});
