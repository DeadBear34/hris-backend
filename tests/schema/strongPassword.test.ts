import { describe, it, expect } from "@jest/globals";
import { strongPassword } from "../../src/schema/commonSchema.js";
import {
  registerSchema,
  changePasswordSchema,
  resetPasswordSchema,
  loginSchema,
} from "../../src/schema/authSchema.js";
import { createEmployeeSchema } from "../../src/schema/employeeSchema.js";

const schema = strongPassword();

function messageOf(value: string): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

// Laporan QA: password baru yang lemah tetap diterima saat diganti
describe("strongPassword", () => {
  it("menerima password yang memenuhi semua syarat", () => {
    expect(schema.safeParse("Password123!").success).toBe(true);
    expect(schema.safeParse("Abcd123!").success).toBe(true);
  });

  it("menolak tanpa huruf besar", () => {
    expect(messageOf("password123!")).toContain("uppercase");
  });

  it("menolak tanpa huruf kecil", () => {
    expect(messageOf("PASSWORD123!")).toContain("lowercase");
  });

  it("menolak tanpa angka", () => {
    expect(messageOf("Password!!")).toContain("number");
  });

  it("menolak tanpa simbol", () => {
    expect(messageOf("Password123")).toContain("symbol");
  });

  it("spasi tidak dihitung sebagai simbol", () => {
    expect(messageOf("Pass word123")).toContain("symbol");
  });

  it("menolak spasi di awal atau akhir", () => {
    expect(messageOf(" Password123!")).toContain("space");
    expect(messageOf("Password123! ")).toContain("space");
  });

  it("menolak kurang dari 8 dan lebih dari 72 karakter", () => {
    expect(messageOf("Ab1!xyz")).toContain("8 characters");
    expect(messageOf(`Aa1!${"x".repeat(69)}`)).toContain("72 characters");
  });

  it("menolak kombinasi lemah yang lazim dipakai", () => {
    for (const weak of ["12345678", "password", "password123", "Password123", "qwertyuiop"]) {
      expect(schema.safeParse(weak).success).toBe(false);
    }
  });
});

describe("aturan password kuat dipakai di setiap tempat password dibuat", () => {
  const weak = "Password123";

  it("pendaftaran", () => {
    const result = registerSchema.safeParse({
      email: "baru@awan.io",
      password: weak,
      full_name: "Karyawan Baru",
      phone: "+628123456789",
      gender: "male",
      terms_accepted: true,
    });

    expect(result.success).toBe(false);
  });

  it("ganti password", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "PasswordLama1!",
      new_password: weak,
    });

    expect(result.success).toBe(false);
  });

  it("reset password", () => {
    const result = resetPasswordSchema.safeParse({
      email: "ismail@awan.io",
      token: "a".repeat(64),
      password: weak,
      password_confirmation: weak,
    });

    expect(result.success).toBe(false);
  });

  it("tambah karyawan oleh admin", () => {
    const result = createEmployeeSchema.safeParse({
      email: "baru@awan.io",
      password: weak,
      full_name: "Karyawan Baru",
      phone: "+628123456789",
      gender: "male",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "password")).toBe(true);
    }
  });

  // Akun lama yang passwordnya dibuat sebelum aturan ini harus tetap bisa masuk
  it("login tidak ikut menerapkan aturan password kuat", () => {
    const result = loginSchema.safeParse({
      email: "ismail@awan.io",
      password: "12345678",
    });

    expect(result.success).toBe(true);
  });
});
