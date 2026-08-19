import { z } from "zod";

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
