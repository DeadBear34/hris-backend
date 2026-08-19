import { z } from "zod";

const statusAbsensi = z.enum(
  ["present", "late", "absent", "leave", "holiday"],
  { message: "Status absensi tidak dikenal" },
);

const catatan = z
  .string()
  .trim()
  .max(500, "Catatan maksimal 500 karakter")
  .optional();

export const checkInSchema = z.object({
  note: catatan,
});

export const checkOutSchema = z.object({
  note: catatan,
});

export const historyQuerySchema = z.object({
  month: z.coerce
    .number()
    .int("Bulan harus bilangan bulat")
    .min(1, "Bulan harus antara 1 sampai 12")
    .max(12, "Bulan harus antara 1 sampai 12")
    .optional(),
  year: z.coerce
    .number()
    .int("Tahun harus bilangan bulat")
    .min(2000, "Tahun tidak valid")
    .max(2200, "Tahun tidak valid")
    .optional(),
  status: statusAbsensi.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(31),
});

export const listAttendanceQuerySchema = z
  .object({
    start_date: z.iso.date("Tanggal awal tidak valid").optional(),
    end_date: z.iso.date("Tanggal akhir tidak valid").optional(),
    department_id: z.uuid("ID departemen tidak valid").optional(),
    employee_id: z.uuid("ID karyawan tidak valid").optional(),
    status: statusAbsensi.optional(),
    search: z.string().trim().min(1).max(150).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "Tanggal akhir tidak boleh mendahului tanggal awal",
      path: ["end_date"],
    },
  );

export const reportQuerySchema = z.object({
  month: z.coerce
    .number()
    .int("Bulan harus bilangan bulat")
    .min(1, "Bulan harus antara 1 sampai 12")
    .max(12, "Bulan harus antara 1 sampai 12")
    .optional(),
  year: z.coerce
    .number()
    .int("Tahun harus bilangan bulat")
    .min(2000, "Tahun tidak valid")
    .max(2200, "Tahun tidak valid")
    .optional(),
  department_id: z.uuid("ID departemen tidak valid").optional(),
});

export const correctAttendanceSchema = z
  .object({
    status: statusAbsensi,
    check_in_at: z.iso.datetime({ offset: true }).nullish(),
    check_out_at: z.iso.datetime({ offset: true }).nullish(),
    reason: z
      .string({ message: "Alasan koreksi wajib diisi" })
      .trim()
      .min(10, "Alasan koreksi minimal 10 karakter")
      .max(500, "Alasan koreksi maksimal 500 karakter"),
  })
  .refine(
    (data) =>
      !data.check_in_at ||
      !data.check_out_at ||
      new Date(data.check_out_at) > new Date(data.check_in_at),
    {
      message: "Jam pulang harus setelah jam masuk",
      path: ["check_out_at"],
    },
  )
  .refine(
    (data) =>
      !(["present", "late"] as string[]).includes(data.status) ||
      Boolean(data.check_in_at),
    {
      message: "Status hadir dan terlambat wajib disertai jam masuk",
      path: ["check_in_at"],
    },
  )
  .refine(
    (data) =>
      !(["absent", "leave", "holiday"] as string[]).includes(data.status) ||
      !data.check_in_at,
    {
      message:
        "Status tidak hadir, cuti, dan libur tidak boleh memiliki jam masuk",
      path: ["check_in_at"],
    },
  );

export const closeDayQuerySchema = z.object({
  date: z.iso.date("Tanggal tidak valid").optional(),
});
