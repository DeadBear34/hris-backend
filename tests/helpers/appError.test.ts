import { describe, it, expect } from "@jest/globals";
import {
  AppError,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../../src/helpers/appError.js";

describe("AppError", () => {
  it("menyimpan statusCode, message, dan code", () => {
    const err = new AppError(418, "Saya teko", "TEAPOT");

    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("Saya teko");
    expect(err.code).toBe("TEAPOT");
  });

  it("merupakan turunan dari Error", () => {
    const err = new AppError(400, "pesan", "CODE");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("factory error", () => {
  it("BadRequest menghasilkan status 400", () => {
    expect(BadRequest().statusCode).toBe(400);
    expect(BadRequest().code).toBe("BAD_REQUEST");
  });

  it("Unauthorized menghasilkan status 401", () => {
    expect(Unauthorized().statusCode).toBe(401);
  });

  it("Forbidden menghasilkan status 403", () => {
    expect(Forbidden().statusCode).toBe(403);
  });

  it("NotFound menghasilkan status 404", () => {
    expect(NotFound().statusCode).toBe(404);
  });

  it("Conflict menghasilkan status 409", () => {
    expect(Conflict().statusCode).toBe(409);
  });

  it("menerima pesan kustom", () => {
    const err = NotFound("Karyawan tidak ditemukan");
    expect(err.message).toBe("Karyawan tidak ditemukan");
  });
});
