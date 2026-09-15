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
