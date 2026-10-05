import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule("../../src/config/logger.js", () => ({
  logger: mockLogger,
}));

const { createRequestLogger, requestLogLevel, SLOW_REQUEST_MS } = await import(
  "../../src/middlewares/requestLogger.js"
);

function buildApp(isProduction: boolean) {
  const app = express();
  app.use(createRequestLogger(isProduction));
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/ok", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/missing", (_req, res) => {
    res.status(404).json({});
  });
  app.get("/broken", (_req, res) => {
    res.status(500).json({});
  });

  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requestLogLevel", () => {
  it("request sukses hanya debug di development", () => {
    expect(requestLogLevel(200, 10, false)).toBe("debug");
  });

  it("request sukses tetap info di production supaya terkumpul di Railway", () => {
    expect(requestLogLevel(200, 10, true)).toBe("info");
  });

  it("kesalahan klien dicatat info", () => {
    expect(requestLogLevel(404, 10, false)).toBe("info");
    expect(requestLogLevel(400, 10, true)).toBe("info");
  });

  it("kesalahan server dicatat warn", () => {
    expect(requestLogLevel(500, 10, false)).toBe("warn");
  });

  it("request sukses yang lambat tetap terlihat di development", () => {
    expect(requestLogLevel(200, SLOW_REQUEST_MS, false)).toBe("info");
  });
});

describe("createRequestLogger", () => {
  it("menulis satu baris ringkas per request", async () => {
    await request(buildApp(false)).get("/ok");

    expect(mockLogger.debug).toHaveBeenCalledTimes(1);

    const [data, message] = mockLogger.debug.mock.calls[0] as [
      { method: string; path: string; status: number },
      string,
    ];

    expect(data).toMatchObject({ method: "GET", path: "/ok", status: 200 });
    expect(message).toMatch(/^GET \/ok 200 \d+ms$/);
  });

  it("tidak mencatat query string karena bisa memuat token", async () => {
    await request(buildApp(false)).get("/ok?token=rahasia123");

    const logged = JSON.stringify(mockLogger.debug.mock.calls);

    expect(logged).not.toContain("rahasia123");
  });

  it("tidak mencatat pemeriksaan kesehatan", async () => {
    await request(buildApp(true)).get("/health");

    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it("memakai tingkat sesuai status respons", async () => {
    const app = buildApp(false);

    await request(app).get("/missing");
    await request(app).get("/broken");

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });
});
