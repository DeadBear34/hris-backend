import { z } from "zod";

const LEAVE_STATUS = ["pending", "approved", "rejected", "cancelled"] as const;

export const listLeaveRequestQuerySchema = z
  .object({
    status: z
      .enum(LEAVE_STATUS, { message: "Invalid leave status" })
      .optional(),
    employee_id: z.uuid("Invalid employee").optional(),
    leave_type_id: z.uuid("Invalid leave type").optional(),
    start_date: z.iso.date("Invalid start date").optional(),
    end_date: z.iso.date("Invalid end date").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.start_date <= data.end_date,
    {
      message: "End date cannot be earlier than start date",
      path: ["end_date"],
    },
  );

export const createLeaveRequestSchema = z
  .object({
    leave_type_id: z.uuid("Leave type is required"),

    start_date: z.iso.date("Invalid start date"),
    end_date: z.iso.date("Invalid end date"),

    reason: z
      .string()
      .trim()
      .max(500, "Reason must be at most 500 characters")
      .optional(),
  })
  .refine((data) => data.start_date <= data.end_date, {
    message: "End date cannot be earlier than start date",
    path: ["end_date"],
  });

export const decideLeaveRequestSchema = z.object({
  decision_note: z
    .string()
    .trim()
    .max(500, "Decision note must be at most 500 characters")
    .optional(),
});

// Menyetujui boleh melampaui batas cuti bersamaan departemen hanya oleh
// pemegang leave.approve_all, dan alasannya wajib ditulis di decision_note
export const approveLeaveRequestSchema = decideLeaveRequestSchema.extend({
  override_staffing_limit: z.boolean().optional(),
});

// Kalender cuti satu departemen, paling panjang 62 hari supaya cukup untuk
// menampilkan dua bulan di kalender tanpa permintaan yang terlalu berat
export const MAX_CALENDAR_DAYS = 62;

export const departmentCalendarQuerySchema = z
  .object({
    start_date: z.iso.date("Invalid start date"),
    end_date: z.iso.date("Invalid end date"),
    department_id: z.uuid("Invalid department").optional(),
  })
  .refine((data) => data.start_date <= data.end_date, {
    message: "End date cannot be earlier than start date",
    path: ["end_date"],
  })
  .refine(
    (data) =>
      (Date.parse(data.end_date) - Date.parse(data.start_date)) / 86_400_000 <
      MAX_CALENDAR_DAYS,
    {
      message: `The date range can cover at most ${MAX_CALENDAR_DAYS} days`,
      path: ["end_date"],
    },
  );
