import { z } from "zod";

export const listHolidayQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const createHolidaySchema = z.object({
  holiday_date: z.iso.date("Invalid holiday date"),

  name: z
    .string({ message: "Holiday name is required" })
    .trim()
    .min(3, "Holiday name must be at least 3 characters")
    .max(150, "Holiday name must be at most 150 characters"),

  is_collective_leave: z.boolean().optional(),
});

export const updateHolidaySchema = createHolidaySchema.partial();
