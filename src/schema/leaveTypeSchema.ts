import { z } from "zod";

export const createLeaveTypeSchema = z.object({
  code: z
    .string({ message: "Leave type code is required" })
    .trim()
    .toUpperCase()
    .min(2, "Leave type code must be at least 2 characters")
    .max(20, "Leave type code must be at most 20 characters"),

  name: z
    .string({ message: "Leave type name is required" })
    .trim()
    .min(3, "Leave type name must be at least 3 characters")
    .max(100, "Leave type name must be at most 100 characters"),

  default_quota: z.coerce
    .number()
    .min(0, "Leave quota cannot be negative")
    .max(365, "Leave quota must be at most 365 days")
    .nullable()
    .optional(),

  deducts_balance: z.boolean().optional(),
  is_paid: z.boolean().optional(),
  requires_attachment: z.boolean().optional(),

  attachment_required_after: z.coerce
    .number()
    .int("Attachment threshold must be an integer")
    .min(1, "Attachment threshold must be at least 1 day")
    .nullable()
    .optional(),

  max_days_per_request: z.coerce
    .number()
    .int("Max days per request must be an integer")
    .min(1, "Max days per request must be at least 1")
    .max(365, "Max days per request must be at most 365")
    .nullable()
    .optional(),

  min_notice_days: z.coerce
    .number()
    .int("Minimum notice must be an integer")
    .min(0, "Minimum notice cannot be negative")
    .max(365, "Minimum notice must be at most 365 days")
    .optional(),

  gender_restriction: z
    .enum(["male", "female"], { message: "Invalid gender restriction" })
    .nullable()
    .optional(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });
