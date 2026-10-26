import { jest, describe, it, expect } from "@jest/globals";
import request from "supertest";
import { brotliCompressSync, gzipSync } from "node:zlib";

jest.unstable_mockModule("../../src/config/databaseConnection.js", () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

const { app } = await import("../../src/app.js");

const LOGIN = "/api/v1/auth/login";
const body = JSON.stringify({ email: "qa@hris.click", password: "x" });

describe("body request terkompresi ditolak (CVE-2026-111497)", () => {
  it("menolak body Brotli dengan 415 tanpa mendekompresinya", async () => {
    const res = await request(app)
      .post(LOGIN)
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "br")
      .send(brotliCompressSync(body));

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      success: false,
      message: "Compressed request bodies are not supported",
      code: "UNSUPPORTED_ENCODING",
    });
  });

  it("menolak body Brotli yang rusak dengan 415, bukan crash atau 500", async () => {
    const res = await request(app)
      .post(LOGIN)
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "br")
      .send(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x00, 0x13, 0x37]));

    expect(res.status).toBe(415);
  });

  it("menolak body gzip dengan 415", async () => {
    const res = await request(app)
      .post(LOGIN)
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "gzip")
      .send(gzipSync(body));

    expect(res.status).toBe(415);
    expect(res.body.code).toBe("UNSUPPORTED_ENCODING");
  });

  it("body JSON biasa tetap dibaca", async () => {
    const res = await request(app)
      .post(LOGIN)
      .set("Content-Type", "application/json")
      .send({ email: "bukan-email" });

    // sampai ke validasi, artinya body berhasil dibaca
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("body yang terlalu besar dijawab 413, bukan 500", async () => {
    const res = await request(app)
      .post(LOGIN)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a".repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
