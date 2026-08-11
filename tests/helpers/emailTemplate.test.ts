import { describe, it, expect } from "@jest/globals";
import {
  verificationCodeEmail,
  passwordResetEmail,
  passwordResetSuccessEmail,
  accountApprovedEmail,
} from "../../src/helpers/emailTemplate.js";

const SEMUA_TEMPLATE = [
  verificationCodeEmail("123456", 10, "Ismail Muhammad"),
  passwordResetEmail("https://hris.test/reset?token=abc", 15, "Ismail"),
  passwordResetSuccessEmail("Ismail"),
  accountApprovedEmail("https://hris.test/login", "Ismail"),
];

describe("seluruh template email", () => {
  it("selalu memiliki subjek dan isi", () => {
    for (const template of SEMUA_TEMPLATE) {
      expect(template.subject.length).toBeGreaterThan(0);
      expect(template.html.length).toBeGreaterThan(0);
    }
  });

  it("menyapa penerima dengan namanya", () => {
    for (const template of SEMUA_TEMPLATE) {
      expect(template.html).toContain("Ismail");
    }
  });

  it("tetap dapat dipakai tanpa nama penerima", () => {
    const tanpaNama = [
      verificationCodeEmail("123456", 10),
      passwordResetEmail("https://hris.test/reset", 15),
      passwordResetSuccessEmail(),
      accountApprovedEmail("https://hris.test/login"),
    ];

    for (const template of tanpaNama) {
      expect(template.html).toContain("Halo,");
    }
  });

  it("ditulis dalam bahasa Indonesia", () => {
    for (const template of SEMUA_TEMPLATE) {
      expect(template.html).toContain("HRIS Awanio");
    }
  });
});

describe("verificationCodeEmail", () => {
  it("menampilkan kode verifikasi", () => {
    const template = verificationCodeEmail("098765", 10);

    expect(template.html).toContain("098765");
    expect(template.subject).toContain("098765");
  });

  it("menyebutkan masa berlaku kode", () => {
    const template = verificationCodeEmail("123456", 10);

    expect(template.html).toContain("10 menit");
  });
});

describe("passwordResetEmail", () => {
  it("menyertakan tautan reset sebagai tombol dan teks", () => {
    const tautan = "https://hris.test/reset-password?token=abc&email=a%40b.io";
    const template = passwordResetEmail(tautan, 15);

    expect(template.html).toContain(`href="${tautan}"`);
    expect(template.html).toContain(tautan);
  });

  it("menyebutkan masa berlaku tautan", () => {
    const template = passwordResetEmail("https://hris.test/reset", 15);

    expect(template.html).toContain("15 menit");
  });

  it("memberi tahu bahwa password tidak berubah jika bukan pengguna yang meminta", () => {
    const template = passwordResetEmail("https://hris.test/reset", 15);

    expect(template.html).toContain("tidak akan berubah");
  });
});

describe("accountApprovedEmail", () => {
  it("menyertakan tautan login", () => {
    const template = accountApprovedEmail("https://hris.test/login");

    expect(template.html).toContain('href="https://hris.test/login"');
  });
});

describe("kerahasiaan isi email", () => {
  const RAHASIA = ["password123", "Password123", "$argon2id$"];

  it("tidak pernah memuat password pengguna", () => {
    for (const template of SEMUA_TEMPLATE) {
      for (const rahasia of RAHASIA) {
        expect(template.html).not.toContain(rahasia);
        expect(template.subject).not.toContain(rahasia);
      }
    }
  });

  it("pemberitahuan reset tidak memuat password baru", () => {
    const template = passwordResetSuccessEmail("Ismail");

    expect(template.html.toLowerCase()).not.toContain("password baru kamu:");
    expect(template.html).toContain("login kembali");
  });
});
