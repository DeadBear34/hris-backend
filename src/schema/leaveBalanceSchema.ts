import { z } from "zod";

const periodYear = z.coerce
  .number()
  .int("Tahun periode harus bilangan bulat")
  .min(2000, "Tahun periode minimal 2000")
  .max(2100, "Tahun periode maksimal 2100");

export const balanceQuerySchema = z.object({
  period_year: periodYear.optional(),
});

export const listLedgerQuerySchema = z.object({
  period_year: periodYear.optional(),
  leave_type_id: z.uuid("Jenis cuti tidak valid").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const adjustBalanceSchema = z.object({
  employee_id: z.uuid("Karyawan wajib dipilih"),
  leave_type_id: z.uuid("Jenis cuti wajib dipilih"),
  period_year: periodYear,

  amount: z.coerce
    .number()
    .refine((value) => value !== 0, "Jumlah penyesuaian tidak boleh nol"),

  note: z
    .string({ message: "Alasan penyesuaian wajib diisi" })
    .trim()
    .min(3, "Alasan penyesuaian minimal 3 karakter")
    .max(500, "Alasan penyesuaian maksimal 500 karakter"),
});
