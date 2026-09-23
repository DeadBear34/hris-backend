import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

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
});

export const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  is_active: z.boolean().optional(),
  updated_at: expectedUpdatedAt,
});
