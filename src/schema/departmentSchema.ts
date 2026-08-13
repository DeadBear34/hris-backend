import { z } from "zod";

export const createDepartmentSchema = z.object({
  code: z
    .string({ message: "Kode departemen wajib diisi" })
    .trim()
    .toUpperCase()
    .min(2, "Kode departemen minimal 2 karakter")
    .max(20, "Kode departemen maksimal 20 karakter"),

  name: z
    .string({ message: "Nama departemen wajib diisi" })
    .trim()
    .min(3, "Nama departemen minimal 3 karakter")
    .max(100, "Nama departemen maksimal 100 karakter"),
});

export const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });
