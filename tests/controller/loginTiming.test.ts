import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.unstable_mockModule("../../src/models/user.js", () => ({
  findByEmail: jest.fn(() => Promise.resolve(null)),
  findById: jest.fn(),
  updateLastLogin: jest.fn(),
  findSessionInfo: jest.fn(),
}));

jest.unstable_mockModule("../../src/helpers/password.js", () => ({
  hashPassword: jest.fn(() => Promise.resolve("hash-tiruan")),
  verifyPassword: jest.fn(() => Promise.resolve(false)),
}));

const { verifyPassword, hashPassword } =
  await import("../../src/helpers/password.js");
const { app } = await import("../../src/app.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("login dengan email yang tidak terdaftar", () => {
  it("tetap menjalankan pemeriksaan password supaya waktunya tidak membocorkan email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tidak.ada@hris.click", password: "Password123!" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Incorrect email or password");
    expect(verifyPassword).toHaveBeenCalledWith("hash-tiruan", "Password123!");
  });

  it("hash tiruan hanya dibuat sekali", async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: `asing${i}@hris.click`, password: "Password123!" });
    }

    expect(verifyPassword).toHaveBeenCalledTimes(3);
    // dibuat paling banyak sekali sepanjang umur proses
    expect((hashPassword as jest.Mock).mock.calls.length).toBeLessThanOrEqual(
      1,
    );
  });
});
