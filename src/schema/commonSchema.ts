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

// Nilai updated_at yang diterima klien saat membuka data, dikirim balik saat
// menyimpan. Dipakai mendeteksi data yang sudah diubah orang lain di tengah jalan
export const expectedUpdatedAt = z.iso
  .datetime({
    offset: true,
    message: "updated_at must be the value you received when loading the data",
  })
  .optional();
