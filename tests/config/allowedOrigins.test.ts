import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const { originAllowed, allowedOrigins } =
  await import("../../src/config/allowedOrigins.js");

describe("daftar asal yang diizinkan", () => {
  it("terbaca dari CORS_ORIGIN", () => {
    expect(allowedOrigins.length).toBeGreaterThan(0);
    expect(allowedOrigins.every((o) => o.startsWith("http"))).toBe(true);
  });

  it("mengizinkan asal yang terdaftar", () => {
    expect(originAllowed(allowedOrigins[0])).toBe(true);
  });

  it("menolak asal yang tidak terdaftar", () => {
    expect(originAllowed("https://situs-jahat.com")).toBe(false);
  });

  it("menolak asal yang mirip tapi berbeda", () => {
    expect(originAllowed("http://localhost:5174")).toBe(false);
    expect(originAllowed("https://localhost:5173")).toBe(false);
  });

  it("menolak subdomain yang menyamar", () => {
    expect(originAllowed("http://localhost:5173.jahat.com")).toBe(false);
  });

  // Hanya browser yang bisa disuruh menyambung oleh situs lain, dan browser
  // selalu mengirim Origin. Klien non-browser tidak perlu dihalangi
  it("mengizinkan permintaan tanpa Origin", () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("")).toBe(true);
  });
});
