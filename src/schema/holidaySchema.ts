import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

export const listHolidayQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const holidayFields = z.object({
  holiday_date: z.iso.date("Invalid holiday date"),

  name: z
    .string({ message: "Holiday name is required" })
    .trim()
    .min(3, "Holiday name must be at least 3 characters")
    .max(150, "Holiday name must be at most 150 characters"),

  is_collective_leave: z.boolean().optional(),
});

// Frontend mengirim tanggalnya sebagai `date`, sedangkan nama resminya
// `holiday_date`. Tanpa alias ini, menambah hari libur selalu ditolak karena
// holiday_date dianggap kosong, dan mengubah tanggal diam-diam diabaikan.
// Bila keduanya dikirim, holiday_date yang dipakai
function acceptDateAlias(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }

  const { date, ...rest } = input as Record<string, unknown>;

  if (rest.holiday_date === undefined && date !== undefined) {
    return { ...rest, holiday_date: date };
  }

  return rest;
}

export const createHolidaySchema = z.preprocess(acceptDateAlias, holidayFields);

export const updateHolidaySchema = z.preprocess(
  acceptDateAlias,
  holidayFields.partial().extend({ updated_at: expectedUpdatedAt }),
);
