import { describe, it, expect } from "@jest/globals";
import {
  generateVerificationCode,
  generateResetToken,
  expiresInMinutes,
} from "../../src/helpers/token.js";

describe("generateVerificationCode", () => {
  it("selalu menghasilkan enam digit angka", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it("mempertahankan angka nol di depan", () => {
    const kode = Array.from({ length: 500 }, () => generateVerificationCode());

    expect(kode.every((k) => k.length === 6)).toBe(true);
  });

  it("tidak menghasilkan kode yang sama berulang kali", () => {
    const kode = new Set(
      Array.from({ length: 50 }, () => generateVerificationCode()),
    );

    expect(kode.size).toBeGreaterThan(1);
  });
});

describe("generateResetToken", () => {
  it("menghasilkan 32 byte dalam bentuk heksadesimal", () => {
    const token = generateResetToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tidak pernah menghasilkan token yang sama", () => {
    const token = new Set(Array.from({ length: 50 }, generateResetToken));

    expect(token.size).toBe(50);
  });
});

describe("expiresInMinutes", () => {
  it("menghasilkan waktu di masa depan", () => {
    expect(expiresInMinutes(10).getTime()).toBeGreaterThan(Date.now());
  });

  it("menghitung selisih sesuai jumlah menit", () => {
    const selisih = expiresInMinutes(15).getTime() - Date.now();

    expect(selisih).toBeGreaterThan(14 * 60_000);
    expect(selisih).toBeLessThanOrEqual(15 * 60_000);
  });
});
