import { z } from "zod";

/**
 * Halaman admin mengirim seluruh centang sekaligus, jadi yang diterima adalah
 * daftar kode fitur yang menjadi keadaan akhir sebuah jabatan. Daftar kosong
 * berarti mencabut seluruh fitur, dan itu sah.
 */
export const replacePositionFeaturesSchema = z.object({
  codes: z
    .array(
      z
        .string({ message: "Kode fitur harus berupa teks" })
        .trim()
        .min(1, "Kode fitur tidak boleh kosong")
        .max(60, "Kode fitur maksimal 60 karakter"),
      { message: "Daftar kode fitur wajib diisi" },
    )
    .max(200, "Terlalu banyak kode fitur dalam satu permintaan"),
});
