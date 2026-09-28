import { z } from "zod";

// Batas kewajaran satu kali penyesuaian, bukan batas saldo. Dipakai sebagai
// jaring pengaman terhadap salah ketik
export const MAX_ADJUSTMENT_DAYS = 365;

const periodYear = z.coerce
  .number()
  .int("Period year must be an integer")
  .min(2000, "Period year must be at least 2000")
  .max(2100, "Period year must be at most 2100");

export const balanceQuerySchema = z.object({
  period_year: periodYear.optional(),
});

export const listLedgerQuerySchema = z.object({
  period_year: periodYear.optional(),
  leave_type_id: z.uuid("Invalid leave type").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const adjustBalanceSchema = z.object({
  employee_id: z.uuid("Employee is required"),
  leave_type_id: z.uuid("Leave type is required"),
  period_year: periodYear,

  amount: z.coerce
    .number()
    .refine((value) => value !== 0, "Adjustment amount cannot be zero")
    // Satu tahun hanya punya 365 hari, jadi angka di atas itu hampir pasti
    // salah ketik. Tanpa batas ini, satu ketikan keliru dapat membuat saldo
    // minus ratusan ribu hari
    .refine(
      (value) => Math.abs(value) <= MAX_ADJUSTMENT_DAYS,
      `Adjustment amount must be between -${MAX_ADJUSTMENT_DAYS} and ${MAX_ADJUSTMENT_DAYS} days`,
    ),

  note: z
    .string({ message: "Adjustment reason is required" })
    .trim()
    .min(3, "Adjustment reason must be at least 3 characters")
    .max(500, "Adjustment reason must be at most 500 characters"),
});
