import { describe, it, expect } from "@jest/globals";
import { hashPassword, verifyPassword } from "../../src/helpers/password.js";

describe("password helper", () => {
  it("menghasilkan hash yang berbeda dari password aslinya", async () => {
    const hash = await hashPassword("password123");
    expect(hash).not.toBe("password123");
    expect(hash).toContain("$argon2id$");
  });

  it("menghasilkan hash berbeda untuk password yang sama", async () => {
    const a = await hashPassword("password123");
    const b = await hashPassword("password123");
    expect(a).not.toBe(b);
  });

  it("memverifikasi password yang benar", async () => {
    const hash = await hashPassword("password123");
    await expect(verifyPassword(hash, "password123")).resolves.toBe(true);
  });

  it("menolak password yang salah", async () => {
    const hash = await hashPassword("password123");
    await expect(verifyPassword(hash, "passwordsalah")).resolves.toBe(false);
  });
});
