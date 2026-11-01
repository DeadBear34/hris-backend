import type { Request, Response, NextFunction } from "express";
import * as workScheduleModel from "../models/workSchedule.js";
import * as departmentModel from "../models/department.js";
import type { WorkScheduleInput } from "../models/workSchedule.js";
import { minutesFromClockTime } from "../helpers/timezone.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { BadRequest, Conflict, NotFound } from "../helpers/appError.js";
import { plural } from "../helpers/plural.js";
import { requireRequestEmployee } from "../helpers/requestEmployee.js";
import { withTransaction } from "../helpers/transaction.js";

const SCHEDULE_DEFAULTS = {
  start_time: "08:00",
  end_time: "18:00",
  late_tolerance_minutes: 5,
  absent_cutoff_time: "18:00",
} as const;

function assertScheduleTimesMakeSense(hour: {
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  absent_cutoff_time: string;
}): void {
  if (hour.end_time <= hour.start_time) {
    throw BadRequest(
      `End time ${hour.end_time} must be later than start time ${hour.start_time}`,
    );
  }

  const toleranceEnd =
    minutesFromClockTime(hour.start_time) + hour.late_tolerance_minutes;
  const cutoffMinutes = minutesFromClockTime(hour.absent_cutoff_time);

  if (cutoffMinutes <= toleranceEnd) {
    throw BadRequest(
      `Absence cutoff ${hour.absent_cutoff_time} must be after the late tolerance ends, which is ${plural(hour.late_tolerance_minutes, "minute")} after the ${hour.start_time} start time`,
    );
  }

  if (cutoffMinutes > minutesFromClockTime(hour.end_time)) {
    throw BadRequest(
      `Absence cutoff ${hour.absent_cutoff_time} cannot be later than end time ${hour.end_time}`,
    );
  }
}

export async function ListWorkScheduleController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const schedules = await workScheduleModel.findAll();

    res.json({ success: true, data: schedules });
  } catch (err) {
    next(err);
  }
}

export async function MyWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await requireRequestEmployee(req, res);

    const schedule = await workScheduleModel.resolveForEmployee(employee.id);
    if (!schedule) {
      throw NotFound(
        "No work schedule applies to you yet, please contact an admin",
      );
    }

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

export async function DetailWorkScheduleController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const schedule = await workScheduleModel.findById(id);
    if (!schedule) throw NotFound("Work schedule not found");

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

// Semua divisi harus ada dan belum dipakai jadwal lain. Satu divisi hanya
// boleh punya satu jadwal, kalau tidak jadwal karyawannya menjadi ambigu
async function assertDepartmentsAvailable(
  department_ids: string[],
  exceptScheduleId?: string,
): Promise<void> {
  const existing = new Set(
    await departmentModel.findExistingIds(department_ids),
  );
  const missing = department_ids.filter((id) => !existing.has(id));

  if (missing.length > 0) {
    throw BadRequest(`${plural(missing.length, "department")} not found`, {
      missing_department_ids: missing,
    });
  }

  const taken = await workScheduleModel.findDepartmentOwners(
    department_ids,
    exceptScheduleId,
  );

  if (taken.length > 0) {
    const names = taken
      .map((row) => `${row.department_name} (${row.schedule_name})`)
      .join(", ");

    throw Conflict(
      `These departments already use another work schedule: ${names}. Remove them from that schedule first`,
      { conflicts: taken },
    );
  }
}

export async function CreateWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as WorkScheduleInput;
    const department_ids = data.department_ids ?? [];

    // Jadwal tanpa divisi hanya boleh menjadi jadwal bawaan, dan bawaan
    // hanya satu. Selain itu jadwal tanpa divisi tidak berlaku bagi siapa pun
    const isDefault = department_ids.length === 0;

    if (isDefault) {
      const existing = await workScheduleModel.findDefault();

      if (existing) {
        throw BadRequest(
          `A default schedule named ${existing.name} already exists. Choose at least one department for this schedule`,
        );
      }
    } else {
      await assertDepartmentsAvailable(department_ids);
    }

    assertScheduleTimesMakeSense({
      start_time: data.start_time ?? SCHEDULE_DEFAULTS.start_time,
      end_time: data.end_time ?? SCHEDULE_DEFAULTS.end_time,
      late_tolerance_minutes:
        data.late_tolerance_minutes ?? SCHEDULE_DEFAULTS.late_tolerance_minutes,
      absent_cutoff_time:
        data.absent_cutoff_time ?? SCHEDULE_DEFAULTS.absent_cutoff_time,
    });

    const schedule = await withTransaction(async (client) => {
      const id = await workScheduleModel.createSchedule(
        client,
        { ...data, department_ids },
        isDefault,
      );

      return workScheduleModel.findById(id, client);
    });

    if (!schedule) throw new Error("Failed to load the saved work schedule");

    activity.success({
      action: "schedule.create",
      entity: "work_schedule",
      entity_id: schedule.id,
      summary: isDefault
        ? `Default work schedule ${schedule.name} created`
        : `Work schedule ${schedule.name} created for ${plural(department_ids.length, "department")}`,
      metadata: { department_ids },
    });

    res.status(201).json({
      success: true,
      message: "Work schedule created successfully",
      data: schedule,
    });
  } catch (err) {
    next(err);
  }
}

export async function UpdateWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { updated_at: expectedUpdatedAt, ...data } =
      req.body as Partial<WorkScheduleInput> & {
        updated_at?: string;
      };

    const existing = await workScheduleModel.findById(id);
    if (!existing) throw NotFound("Work schedule not found");

    if (existing.is_default) {
      if (data.department_ids && data.department_ids.length > 0) {
        throw BadRequest(
          "The default schedule applies to every department without its own schedule, so it cannot be limited to specific departments. Create a new schedule for those departments",
        );
      }

      if (data.is_active === false) {
        throw BadRequest(
          "The default schedule cannot be deactivated because it is the fallback for employees without their own schedule",
        );
      }
    } else if (data.department_ids !== undefined) {
      if (data.department_ids.length === 0) {
        throw BadRequest(
          "Choose at least one department, or delete the schedule if it is no longer used",
        );
      }

      await assertDepartmentsAvailable(data.department_ids, id);
    }

    assertScheduleTimesMakeSense({
      start_time: data.start_time ?? existing.start_time,
      end_time: data.end_time ?? existing.end_time,
      late_tolerance_minutes:
        data.late_tolerance_minutes ?? existing.late_tolerance_minutes,
      absent_cutoff_time:
        data.absent_cutoff_time ?? existing.absent_cutoff_time,
    });

    // jadwal bawaan tidak pernah punya divisi, jadi daftar kosong diabaikan
    const changes = existing.is_default
      ? { ...data, department_ids: undefined }
      : data;

    const schedule = await withTransaction(async (client) => {
      const updated = await workScheduleModel.updateSchedule(
        client,
        id,
        changes,
        expectedUpdatedAt,
      );

      if (!updated) {
        throw await rejectStaleUpdate(
          "work_schedule",
          () => workScheduleModel.findById(id),
          "Work schedule not found",
        );
      }

      return workScheduleModel.findById(id, client);
    });

    activity.success({
      action: "schedule.update",
      entity: "work_schedule",
      entity_id: id,
      summary: `Work schedule ${existing.name} updated`,
      metadata: {
        fields: Object.keys(data),
        ...(changes.department_ids !== undefined
          ? {
              departments_from: existing.department_ids,
              departments_to: changes.department_ids,
            }
          : {}),
      },
    });

    res.json({
      success: true,
      message: "Work schedule updated successfully",
      data: schedule,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeleteWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await workScheduleModel.findById(id);
    if (!existing) throw NotFound("Work schedule not found");

    if (existing.is_default) {
      throw BadRequest(
        "The default schedule cannot be deleted because it is the fallback for employees without their own schedule",
      );
    }

    const usageCount = await workScheduleModel.countEmployees(id);

    if (usageCount > 0) {
      throw Conflict(
        `This work schedule is still used by ${plural(usageCount, "employee")}, move them to another schedule first`,
        { employee_count: usageCount },
      );
    }

    await withTransaction((client) =>
      workScheduleModel.softDeleteSchedule(client, id),
    );

    activity.success({
      action: "schedule.delete",
      entity: "work_schedule",
      entity_id: id,
      summary: `Work schedule ${existing.name} deleted`,
      metadata: { released_department_ids: existing.department_ids },
    });

    res.json({ success: true, message: "Work schedule deleted successfully" });
  } catch (err) {
    next(err);
  }
}
