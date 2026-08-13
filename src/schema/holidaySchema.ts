import { z } from "zod";

export const listHolidayQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const createHolidaySchema = z.object({
  holiday_date: z.iso.date("Tanggal hari libur tidak valid"),

  name: z
    .string({ message: "Nama hari libur wajib diisi" })
    .trim()
    .min(3, "Nama hari libur minimal 3 karakter")
    .max(150, "Nama hari libur maksimal 150 karakter"),

  is_collective_leave: z.boolean().optional(),
});

export const updateHolidaySchema = createHolidaySchema.partial();
