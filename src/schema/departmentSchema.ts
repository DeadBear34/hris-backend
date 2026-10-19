import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";
import { UNIT_TYPES } from "../helpers/orgConstants.js";

export const createDepartmentSchema = z.object({
  code: z
    .string({ message: "Department code is required" })
    .trim()
    .toUpperCase()
    .min(2, "Department code must be at least 2 characters")
    .max(20, "Department code must be at most 20 characters"),

  name: z
    .string({ message: "Department name is required" })
    .trim()
    .min(3, "Department name must be at least 3 characters")
    .max(100, "Department name must be at most 100 characters"),

  // baru: unit induk & jenis unit
  // unit induk; null berarti unit puncak (misalnya unit perusahaan)
  parent_id: z.uuid("Invalid parent unit").nullable().optional(),

  unit_type: z
    .enum(UNIT_TYPES, {
      message: `Unit type must be one of: ${UNIT_TYPES.join(", ")}`,
    })
    .optional(),

  // Paling banyak berapa karyawan departemen ini yang boleh cuti pada hari
  // yang sama. Kirim null untuk menghapus batas
  max_concurrent_leave: z.coerce
    .number()
    .int("Maximum concurrent leave must be a whole number")
    .min(1, "Maximum concurrent leave must be at least 1")
    .max(1000, "Maximum concurrent leave must be at most 1000")
    .nullable()
    .optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  is_active: z.boolean().optional(),
  updated_at: expectedUpdatedAt,
});
