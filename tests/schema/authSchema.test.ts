import { describe, it, expect } from "@jest/globals";
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
} from "../../src/schema/authSchema.js";

const validRegister = {
  email: "ismail@awan.io",
  password: "password123",
  full_name: "Ismail Muhammad",
  phone: "+628123456789",
  gender: "male",
  terms_accepted: true,
};

describe("registerSchema", () => {
  it("menerima data yang valid", () => {
    const result = registerSchema.safeParse(validRegister);
    expect(result.success).toBe(true);
  });

  it("mengubah email menjadi huruf kecil", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "Ismail@Awan.IO",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ismail@awan.io");
    }
  });

  it("membuang spasi di awal dan akhir email", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "  ismail@awan.io  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ismail@awan.io");
    }
  });

  it("membuang spasi di awal dan akhir nama", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      full_name: "  Ismail Muhammad  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe("Ismail Muhammad");
    }
  });

  it("membuang field yang tidak ada di skema", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      role: "admin",
      is_active: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
      expect(result.data).not.toHaveProperty("is_active");
    }
  });

  it("menolak email tanpa tanda @", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "bukanemail",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("email");
    }
  });

  it("menolak email tanpa domain", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "ismail@",
    });

    expect(result.success).toBe(false);
  });

  it("menolak email kosong", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "",
    });

    expect(result.success).toBe(false);
  });

  it("menolak password kurang dari 8 karakter", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      password: "1234567",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("8 karakter");
    }
  });

  it("menerima password tepat 8 karakter", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      password: "12345678",
    });

    expect(result.success).toBe(true);
  });

  it("menolak password melebihi 72 karakter", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      password: "a".repeat(73),
    });

    expect(result.success).toBe(false);
  });

  it("menolak nama kurang dari 3 karakter", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      full_name: "Is",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nama yang hanya berisi spasi", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      full_name: "     ",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nomor telepon tanpa kode negara", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      phone: "08123456789",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("phone");
    }
  });

  it("menolak nomor telepon berisi huruf", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      phone: "+62812abcdefg",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nomor telepon terlalu pendek", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      phone: "+62812",
    });

    expect(result.success).toBe(false);
  });

  it("menerima nomor telepon berformat E.164", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      phone: "+6281234567890",
    });

    expect(result.success).toBe(true);
  });

  it("menerima kode negara selain Indonesia", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      phone: "+14155552671",
    });

    expect(result.success).toBe(true);
  });

  it("menerima gender female", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      gender: "female",
    });

    expect(result.success).toBe(true);
  });

  it("menolak gender di luar pilihan", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      gender: "lainnya",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("gender");
    }
  });

  it("menolak jika syarat dan ketentuan tidak disetujui", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      terms_accepted: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("terms_accepted");
    }
  });

  it("menolak jika syarat dan ketentuan tidak dikirim", () => {
    const { terms_accepted, ...tanpaTerms } = validRegister;
    const result = registerSchema.safeParse(tanpaTerms);

    expect(result.success).toBe(false);
  });

  it("melaporkan seluruh field yang bermasalah sekaligus", () => {
    const result = registerSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("menyebutkan nama field pada setiap pesan kesalahan", () => {
    const result = registerSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));

      expect(fields).toContain("email");
      expect(fields).toContain("password");
      expect(fields).toContain("full_name");
      expect(fields).toContain("phone");
      expect(fields).toContain("gender");
      expect(fields).toContain("terms_accepted");
    }
  });
});

describe("loginSchema", () => {
  it("menerima email dan password yang valid", () => {
    const result = loginSchema.safeParse({
      email: "ismail@awan.io",
      password: "password123",
    });

    expect(result.success).toBe(true);
  });

  it("mengubah email menjadi huruf kecil", () => {
    const result = loginSchema.safeParse({
      email: "Ismail@Awan.IO",
      password: "password123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("ismail@awan.io");
    }
  });

  it("tidak menerapkan panjang minimum password", () => {
    const result = loginSchema.safeParse({
      email: "ismail@awan.io",
      password: "abc",
    });

    expect(result.success).toBe(true);
  });

  it("menolak password kosong", () => {
    const result = loginSchema.safeParse({
      email: "ismail@awan.io",
      password: "",
    });

    expect(result.success).toBe(false);
  });

  it("menolak email tidak valid", () => {
    const result = loginSchema.safeParse({
      email: "bukanemail",
      password: "password123",
    });

    expect(result.success).toBe(false);
  });

  it("menolak body kosong", () => {
    const result = loginSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("membuang field selain email dan password", () => {
    const result = loginSchema.safeParse({
      email: "ismail@awan.io",
      password: "password123",
      role: "admin",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("role");
    }
  });
});

describe("changePasswordSchema", () => {
  it("menerima password lama dan baru yang valid", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "password123",
      new_password: "passwordbaru456",
    });

    expect(result.success).toBe(true);
  });

  it("menolak password baru yang sama dengan password lama", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "password123",
      new_password: "password123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("new_password");
    }
  });

  it("menolak password baru kurang dari 8 karakter", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "password123",
      new_password: "abc",
    });

    expect(result.success).toBe(false);
  });

  it("menolak password baru melebihi 72 karakter", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "password123",
      new_password: "a".repeat(73),
    });

    expect(result.success).toBe(false);
  });

  it("menolak password saat ini yang kosong", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "",
      new_password: "passwordbaru456",
    });

    expect(result.success).toBe(false);
  });

  it("menolak body kosong", () => {
    const result = changePasswordSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
