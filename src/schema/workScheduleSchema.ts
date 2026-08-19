import { z } from "zod";

const jam = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Format jam harus HH:MM");

const hariKerja = {
  works_monday: z.boolean().optional(),
  works_tuesday: z.boolean().optional(),
  works_wednesday: z.boolean().optional(),
  works_thursday: z.boolean().optional(),
  works_friday: z.boolean().optional(),
  works_saturday: z.boolean().optional(),
  works_sunday: z.boolean().optional(),
};

const dasarJadwal = z.object({
  name: z
    .string({ message: "Nama jadwal wajib diisi" })
    .trim()
    .min(3, "Nama jadwal minimal 3 karakter")
    .max(100, "Nama jadwal maksimal 100 karakter"),

  department_id: z.uuid("ID departemen tidak valid").nullish(),

  start_time: jam.optional(),
  end_time: jam.optional(),

  late_tolerance_minutes: z
    .number()
    .int("Toleransi keterlambatan harus bilangan bulat")
    .min(0, "Toleransi keterlambatan tidak boleh negatif")
    .max(240, "Toleransi keterlambatan maksimal 240 menit")
    .optional(),

  absent_cutoff_time: jam.optional(),

  ...hariKerja,
  is_active: z.boolean().optional(),
});

const jamPulangSetelahJamMasuk = (data: {
  start_time?: string | undefined;
  end_time?: string | undefined;
}) => !data.start_time || !data.end_time || data.end_time > data.start_time;

const pesanJamPulang = {
  message: "Jam pulang harus lebih besar daripada jam masuk",
  path: ["end_time"],
};

export const createWorkScheduleSchema = dasarJadwal.refine(
  jamPulangSetelahJamMasuk,
  pesanJamPulang,
);

export const updateWorkScheduleSchema = dasarJadwal
  .partial()
  .refine(jamPulangSetelahJamMasuk, pesanJamPulang);
