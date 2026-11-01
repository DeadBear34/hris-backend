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

  // Divisi pemakai jadwal. Kosong berarti jadwal bawaan
  department_ids: z
    .array(z.uuid("Invalid department ID"))
    .max(200, "A schedule can be used by at most 200 departments")
    .optional(),

  // Bentuk lama, satu divisi. Tetap diterima supaya klien lama tidak rusak
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

  // lembur di bawah batas ini tidak dihitung
  overtime_min_minutes: z
    .number()
    .int("Minimum overtime must be an integer")
    .min(0, "Minimum overtime cannot be negative")
    .max(240, "Minimum overtime must be at most 240 minutes")
    .optional(),

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

// department_id lama digabung ke department_ids, dan id yang sama hanya
// dihitung sekali
function normalizeDepartments<
  T extends { department_ids?: string[]; department_id?: string | null },
>({ department_id, ...rest }: T): Omit<T, "department_id"> {
  const ids =
    rest.department_ids ??
    (department_id === undefined
      ? undefined
      : department_id === null
        ? []
        : [department_id]);

  return {
    ...rest,
    ...(ids === undefined ? {} : { department_ids: [...new Set(ids)] }),
  } as Omit<T, "department_id">;
}

export const createWorkScheduleSchema = scheduleBase
  .refine(endAfterStart, endAfterStartMessage)
  .transform(normalizeDepartments);

export const updateWorkScheduleSchema = scheduleBase
  .partial()
  .extend({ updated_at: expectedUpdatedAt })
  .refine(endAfterStart, endAfterStartMessage)
  .transform(normalizeDepartments);
