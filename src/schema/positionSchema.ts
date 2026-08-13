import { z } from "zod";

export const createPositionSchema = z.object({
  code: z
    .string({ message: "Kode jabatan wajib diisi" })
    .trim()
    .toUpperCase()
    .min(2, "Kode jabatan minimal 2 karakter")
    .max(20, "Kode jabatan maksimal 20 karakter"),

  name: z
    .string({ message: "Nama jabatan wajib diisi" })
    .trim()
    .min(3, "Nama jabatan minimal 3 karakter")
    .max(100, "Nama jabatan maksimal 100 karakter"),

  level: z.coerce
    .number()
    .int("Level harus berupa bilangan bulat")
    .min(1, "Level minimal 1")
    .max(10, "Level maksimal 10")
    .optional(),
});

export const updatePositionSchema = createPositionSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });
