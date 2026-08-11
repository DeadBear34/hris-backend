import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string({ message: "Email wajib diisi" })
    .trim()
    .toLowerCase()
    .min(1, "Email wajib diisi")
    .email("Format email tidak valid, contoh: nama@domain.com"),

  password: z
    .string({ message: "Password wajib diisi" })
    .min(8, "Password minimal 8 karakter")
    .max(72, "Password maksimal 72 karakter"),

  full_name: z
    .string({ message: "Nama lengkap wajib diisi" })
    .trim()
    .min(3, "Nama lengkap minimal 3 karakter")
    .max(150, "Nama lengkap maksimal 150 karakter"),

  phone: z
    .string({ message: "Nomor telepon wajib diisi" })
    .trim()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Nomor telepon harus diawali kode negara, contoh: +628123456789",
    ),

  gender: z.enum(["male", "female"], {
    message: "Jenis kelamin wajib dipilih",
  }),

  terms_accepted: z.literal(true, {
    message: "Kamu harus menyetujui syarat dan ketentuan",
  }),
});

export const loginSchema = z.object({
  email: z
    .string({ message: "Email wajib diisi" })
    .trim()
    .toLowerCase()
    .min(1, "Email wajib diisi")
    .email("Format email tidak valid"),

  password: z
    .string({ message: "Password wajib diisi" })
    .min(1, "Password wajib diisi"),
});

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ message: "Password saat ini wajib diisi" })
      .min(1, "Password saat ini wajib diisi"),

    new_password: z
      .string({ message: "Password baru wajib diisi" })
      .min(8, "Password baru minimal 8 karakter")
      .max(72, "Password baru maksimal 72 karakter"),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "Password baru harus berbeda dari password saat ini",
    path: ["new_password"],
  });

export const setUserActiveSchema = z.object({
  is_active: z.boolean({ message: "Status aktif wajib diisi" }),
});

const emailField = z
  .string({ message: "Email wajib diisi" })
  .trim()
  .toLowerCase()
  .min(1, "Email wajib diisi")
  .pipe(z.email("Format email tidak valid, contoh: nama@domain.com"));

export const verifyEmailSchema = z.object({
  email: emailField,

  code: z
    .string({ message: "Kode verifikasi wajib diisi" })
    .trim()
    .regex(/^\d{6}$/, "Kode verifikasi harus terdiri dari 6 digit angka"),
});

export const resendVerificationSchema = z.object({
  email: emailField,
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    email: emailField,

    token: z
      .string({ message: "Token wajib diisi" })
      .trim()
      .min(1, "Token wajib diisi"),

    password: z
      .string({ message: "Password baru wajib diisi" })
      .min(8, "Password baru minimal 8 karakter")
      .max(72, "Password baru maksimal 72 karakter"),

    password_confirmation: z.string({
      message: "Konfirmasi password wajib diisi",
    }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Konfirmasi password tidak sama dengan password baru",
    path: ["password_confirmation"],
  });
