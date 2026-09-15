import { z } from "zod";

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
    .refine((value) => value !== 0, "Adjustment amount cannot be zero"),

  note: z
    .string({ message: "Adjustment reason is required" })
    .trim()
    .min(3, "Adjustment reason must be at least 3 characters")
    .max(500, "Adjustment reason must be at most 500 characters"),
});
