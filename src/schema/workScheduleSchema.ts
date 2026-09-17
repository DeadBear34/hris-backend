import { z } from "zod";
import { expectedUpdatedAt } from "./commonSchema.js";

const hour = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Time format must be HH:MM");

const isWorkday = {
  works_monday: z.boolean().optional(),
  works_tuesday: z.boolean().optional(),
  works_wednesday: z.boolean().optional(),
  works_thursday: z.boolean().optional(),
  works_friday: z.boolean().optional(),
  works_saturday: z.boolean().optional(),
  works_sunday: z.boolean().optional(),
};

const scheduleBase = z.object({
  name: z
    .string({ message: "Schedule name is required" })
    .trim()
    .min(3, "Schedule name must be at least 3 characters")
    .max(100, "Schedule name must be at most 100 characters"),

  department_id: z.uuid("Invalid department ID").nullish(),

  start_time: hour.optional(),
  end_time: hour.optional(),

  late_tolerance_minutes: z
    .number()
    .int("Late tolerance must be an integer")
    .min(0, "Late tolerance cannot be negative")
    .max(240, "Late tolerance must be at most 240 minutes")
    .optional(),

  absent_cutoff_time: hour.optional(),

  ...isWorkday,
  is_active: z.boolean().optional(),
});

const endAfterStart = (data: {
  start_time?: string | undefined;
  end_time?: string | undefined;
}) => !data.start_time || !data.end_time || data.end_time > data.start_time;

const endAfterStartMessage = {
  message: "End time must be later than start time",
  path: ["end_time"],
};

export const createWorkScheduleSchema = scheduleBase.refine(
  endAfterStart,
  endAfterStartMessage,
);

export const updateWorkScheduleSchema = scheduleBase
  .partial()
  .extend({ updated_at: expectedUpdatedAt })
  .refine(endAfterStart, endAfterStartMessage);
