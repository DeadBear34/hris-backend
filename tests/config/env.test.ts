import { describe, it, expect } from "@jest/globals";
import { envSchema } from "../../src/config/env.js";

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  JWT_SECRET: "a".repeat(32),
};

describe("envSchema", () => {
  it("menerima environment yang valid", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("memberi nilai bawaan untuk variabel opsional", () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.PORT).toBe(8080);
      expect(result.data.LOG_LEVEL).toBe("info");
      expect(result.data.JWT_EXPIRES_IN).toBe("24h");
    }
  });

  it("mengubah PORT dari string menjadi angka", () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: "3000" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(typeof result.data.PORT).toBe("number");
    }
  });

  it("menolak jika DATABASE_URL tidak ada", () => {
    const result = envSchema.safeParse({ JWT_SECRET: "a".repeat(32) });
    expect(result.success).toBe(false);
  });

  it("menolak JWT_SECRET kurang dari 32 karakter", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      JWT_SECRET: "terlalupendek",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("32 karakter");
    }
  });

  it("menolak NODE_ENV di luar pilihan", () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: "staging" });
    expect(result.success).toBe(false);
  });

  it("menolak LOG_LEVEL di luar pilihan", () => {
    const result = envSchema.safeParse({ ...validEnv, LOG_LEVEL: "verbose" });
    expect(result.success).toBe(false);
  });

  it("tidak mewajibkan RESEND_API_KEY", () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RESEND_API_KEY).toBeUndefined();
    }
  });

  it("memperlakukan variabel bernilai kosong sebagai belum diisi", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      APP_URL: "",
      MAIL_DRIVER: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RESEND_API_KEY).toBeUndefined();
      expect(result.data.MAIL_DRIVER).toBeUndefined();
      expect(result.data.MAIL_FROM).toContain("@");
      expect(result.data.APP_URL).toBe("http://localhost:5173");
    }
  });

  it("menerima MAIL_DRIVER log dan resend", () => {
    for (const MAIL_DRIVER of ["log", "resend"]) {
      const result = envSchema.safeParse({ ...validEnv, MAIL_DRIVER });

      expect(result.success).toBe(true);
    }
  });

  it("menolak MAIL_DRIVER di luar pilihan", () => {
    const result = envSchema.safeParse({ ...validEnv, MAIL_DRIVER: "smtp" });

    expect(result.success).toBe(false);
  });
});
