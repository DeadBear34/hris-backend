import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

const attendanceStatusEnum = z.enum(
  ["present", "late", "absent", "leave", "holiday"],
  { message: "Unknown attendance status" },
);

const noteField = z
  .string()
  .trim()
  .max(500, "Note must be at most 500 characters")
  .optional();

const offlineTime = z.iso
  .datetime({ offset: true, message: "Invalid offline attendance time" })
  .optional();

export const checkInSchema = z.object({
  note: noteField,
  offline_time: offlineTime,
});

export const checkOutSchema = z.object({
  note: noteField,
  offline_time: offlineTime,
});

export const historyQuerySchema = z.object({
  month: z.coerce
    .number()
    .int("Month must be an integer")
    .min(1, "Month must be between 1 and 12")
    .max(12, "Month must be between 1 and 12")
    .optional(),
  year: z.coerce
    .number()
    .int("Year must be an integer")
    .min(2000, "Invalid year")
    .max(2200, "Invalid year")
    .optional(),
  status: attendanceStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(31),
});

export const listAttendanceQuerySchema = z
  .object({
    start_date: z.iso.date("Invalid start date").optional(),
    end_date: z.iso.date("Invalid end date").optional(),
    department_id: z.uuid("Invalid department ID").optional(),
    employee_id: z.uuid("Invalid employee ID").optional(),
    status: attendanceStatusEnum.optional(),
    search: z.string().trim().min(1).max(150).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "End date cannot be before start date",
      path: ["end_date"],
    },
  );

export const reportQuerySchema = z.object({
  month: z.coerce
    .number()
    .int("Month must be an integer")
    .min(1, "Month must be between 1 and 12")
    .max(12, "Month must be between 1 and 12")
    .optional(),
  year: z.coerce
    .number()
    .int("Year must be an integer")
    .min(2000, "Invalid year")
    .max(2200, "Invalid year")
    .optional(),
  department_id: z.uuid("Invalid department ID").optional(),
});

export const correctAttendanceSchema = z
  .object({
    status: attendanceStatusEnum,
    updated_at: expectedUpdatedAt,
    check_in_at: z.iso.datetime({ offset: true }).nullish(),
    check_out_at: z.iso.datetime({ offset: true }).nullish(),
    reason: z
      .string({ message: "Correction reason is required" })
      .trim()
      .min(10, "Correction reason must be at least 10 characters")
      .max(500, "Correction reason must be at most 500 characters"),
  })
  .refine(
    (data) =>
      !data.check_in_at ||
      !data.check_out_at ||
      new Date(data.check_out_at) > new Date(data.check_in_at),
    {
      message: "Check-out time must be after check-in time",
      path: ["check_out_at"],
    },
  )
  .refine(
    (data) =>
      !(["present", "late"] as string[]).includes(data.status) ||
      Boolean(data.check_in_at),
    {
      message: "Present and late statuses require a check-in time",
      path: ["check_in_at"],
    },
  )
  .refine(
    (data) =>
      !(["absent", "leave", "holiday"] as string[]).includes(data.status) ||
      !data.check_in_at,
    {
      message:
        "Absent, leave, and holiday statuses cannot have a check-in time",
      path: ["check_in_at"],
    },
  );

export const closeDayQuerySchema = z.object({
  date: z.iso.date("Invalid date").optional(),
});

export const offlineLogQuerySchema = z
  .object({
    start_date: z.iso.date("Invalid start date").optional(),
    end_date: z.iso.date("Invalid end date").optional(),
    department_id: z.uuid("Invalid department ID").optional(),
    employee_id: z.uuid("Invalid employee ID").optional(),
    min_delay_minutes: z.coerce.number().int().min(1).max(1440).default(2),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "End date cannot be before start date",
      path: ["end_date"],
    },
  );

export const eventLogQuerySchema = z
  .object({
    employee_id: z.uuid("Invalid employee ID").optional(),
    kind: z.enum(["check_in", "check_out"]).optional(),
    source: z
      .enum(["online", "offline_sync", "system", "correction"])
      .optional(),
    only_rejected: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    start_date: z.iso.date("Invalid start date").optional(),
    end_date: z.iso.date("Invalid end date").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.end_date >= data.start_date,
    {
      message: "End date cannot be before start date",
      path: ["end_date"],
    },
  );
