import { z } from "zod";

export const idParamSchema = z.object({
  id: z.uuid("Invalid ID"),
});

// Nama orang: huruf apa pun termasuk beraksen, ditambah tanda yang memang
// lazim muncul pada nama Indonesia, yaitu spasi, titik pada gelar, apostrof,
// dan tanda hubung. Angka serta simbol ditolak, sehingga masukan seperti
// "<script>alert('xss')</script>" tidak pernah tersimpan sebagai nama.
// Harus diawali huruf supaya tanda baca tidak dapat berdiri sendiri
const PERSON_NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u;

export function personName(label: string) {
  return z
    .string({ message: `${label} is required` })
    .trim()
    .min(3, `${label} must be at least 3 characters`)
    .max(150, `${label} must be at most 150 characters`)
    .regex(
      PERSON_NAME,
      `${label} may only contain letters, spaces, periods, apostrophes, and hyphens`,
    );
}

// Aturan password kuat, dipakai di semua tempat password dibuat atau
// diganti: daftar, ganti password, reset password, dan tambah karyawan.
// Login tidak memakainya, supaya akun lama yang passwordnya dibuat sebelum
// aturan ini tetap bisa masuk. Batas 72 karakter dipertahankan dari aturan
// sebelumnya. Simbol berarti karakter selain huruf, angka, dan spasi
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function strongPassword(label = "Password") {
  return z
    .string({ message: `${label} is required` })
    .min(PASSWORD_MIN_LENGTH, `${label} must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `${label} must be at most ${PASSWORD_MAX_LENGTH} characters`)
    .regex(/[A-Z]/, `${label} must contain at least one uppercase letter`)
    .regex(/[a-z]/, `${label} must contain at least one lowercase letter`)
    .regex(/[0-9]/, `${label} must contain at least one number`)
    .regex(/[^A-Za-z0-9\s]/, `${label} must contain at least one symbol, for example ! @ # $ %`)
    .refine((value) => value === value.trim(), {
      message: `${label} must not start or end with a space`,
    });
}

// Nilai updated_at yang diterima klien saat membuka data, dikirim balik saat
// menyimpan. Dipakai mendeteksi data yang sudah diubah orang lain di tengah jalan
export const expectedUpdatedAt = z.iso
  .datetime({
    offset: true,
    message: "updated_at must be the value you received when loading the data",
  })
  .optional();
