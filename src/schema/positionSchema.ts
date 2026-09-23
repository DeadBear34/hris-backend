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
});

export const updatePositionSchema = createPositionSchema.partial().extend({
  is_active: z.boolean().optional(),
  updated_at: expectedUpdatedAt,
});
