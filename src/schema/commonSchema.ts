import { z } from "zod";

export const idParamSchema = z.object({
  id: z.uuid("Invalid ID"),
});

// Nilai updated_at yang diterima klien saat membuka data, dikirim balik saat
// menyimpan. Dipakai mendeteksi data yang sudah diubah orang lain di tengah jalan
export const expectedUpdatedAt = z.iso
  .datetime({
    offset: true,
    message: "updated_at must be the value you received when loading the data",
  })
  .optional();
