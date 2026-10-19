import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

export const createPositionSchema = z.object({
  code: z
    .string({ message: "Position code is required" })
    .trim()
    .toUpperCase()
    .min(2, "Position code must be at least 2 characters")
    .max(20, "Position code must be at most 20 characters"),

  name: z
    .string({ message: "Position name is required" })
    .trim()
    .min(3, "Position name must be at least 3 characters")
    .max(100, "Position name must be at most 100 characters"),

  level: z.coerce
    .number()
    .int("Level must be an integer")
    .min(1, "Level must be at least 1")
    .max(10, "Level must be at most 10")
    .optional(),

  // baru: jabatan wajib punya unit, plus atasan jabatan & kuota
  // unit pemilik jabatan: departemen, direktorat, atau unit perusahaan
  department_id: z.uuid("Unit is required"),

  // atasan jabatan. Kosong hanya untuk satu jabatan puncak (misalnya CEO)
  reports_to_position_id: z
    .uuid("Invalid superior position")
    .nullable()
    .optional(),

  is_unit_head: z.boolean().optional(),

  // kuota kursi; null berarti tanpa batas
  max_holders: z.coerce
    .number()
    .int("Maximum holders must be a whole number")
    .min(1, "Maximum holders must be at least 1")
    .max(1000, "Maximum holders must be at most 1000")
    .nullable()
    .optional(),
});

export const updatePositionSchema = createPositionSchema.partial().extend({
  is_active: z.boolean().optional(),
  updated_at: expectedUpdatedAt,
});

// baru: query pratinjau atasan; karyawan yang sedang diubah dikecualikan
export const positionLineManagerQuerySchema = z.object({
  exclude_employee_id: z.uuid("Invalid employee").optional(),
});
