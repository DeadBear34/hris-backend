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

  it("REDIS_URL boleh dikosongkan, dan Redis dianggap tidak dipakai", () => {
    const blank = envSchema.safeParse({ ...validEnv, REDIS_URL: "" });

    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.REDIS_URL).toBeUndefined();
  });

  it("REDIS_URL menerima redis:// dan rediss://", () => {
    for (const url of [
      "redis://127.0.0.1:6379",
      "rediss://default:rahasia@contoh.upstash.io:6379",
    ]) {
      expect(envSchema.safeParse({ ...validEnv, REDIS_URL: url }).success).toBe(
        true,
      );
    }
  });

  it("REDIS_URL menolak alamat yang bukan Redis", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      REDIS_URL: "http://127.0.0.1:6379",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("redis://");
    }
  });

  it("menolak PORT di luar rentang yang dikenal jaringan", () => {
    // Persis kejadian di production: 8080 tertulis 80808
    const result = envSchema.safeParse({ ...validEnv, PORT: "80808" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("65535");
    }
  });

  it("menolak PORT nol dan PORT berupa pecahan", () => {
    expect(envSchema.safeParse({ ...validEnv, PORT: "0" }).success).toBe(false);
    expect(envSchema.safeParse({ ...validEnv, PORT: "80.5" }).success).toBe(
      false,
    );
  });

  it("menerima batas atas yang masih sah", () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: "65535" });

    expect(result.success).toBe(true);
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
      expect(result.error.issues[0]?.message).toContain("32 characters");
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

  it("LOG_LEVEL kosong memakai info, seperti isi .env.example", () => {
    const result = envSchema.safeParse({ ...validEnv, LOG_LEVEL: "" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.LOG_LEVEL).toBe("info");
  });

  it("LOG_LEVEL boleh silent untuk mematikan log sepenuhnya", () => {
    const result = envSchema.safeParse({ ...validEnv, LOG_LEVEL: "silent" });

    expect(result.success).toBe(true);
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
