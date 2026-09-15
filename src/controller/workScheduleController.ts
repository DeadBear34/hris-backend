import type { Request, Response, NextFunction } from "express";
import * as workScheduleModel from "../models/workSchedule.js";
import * as departmentModel from "../models/department.js";
import * as employeeModel from "../models/employee.js";
import type { WorkScheduleInput } from "../models/workSchedule.js";
import { minutesFromClockTime } from "../helpers/timezone.js";
import { startActivity } from "../helpers/activityLog.js";
import {
  BadRequest,
  Conflict,
  NotFound,
  Unauthorized,
} from "../helpers/appError.js";
import { plural } from "../helpers/plural.js";

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
    if (!req.user) {
      throw Unauthorized("You are not logged in, please log in first");
    }

    const employee = await employeeModel.findByUserId(req.user.id);
    if (!employee) {
      throw BadRequest(
        "Your account is not linked to an employee record yet, please contact an admin first",
      );
    }

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

export async function CreateWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as WorkScheduleInput;

    if (data.department_id) {
      const department = await departmentModel.findById(data.department_id);
      if (!department) throw BadRequest("Department not found");

      const existing = await workScheduleModel.findByDepartment(
        data.department_id,
      );

      if (existing) {
        throw Conflict(
          `Department ${department.name} already has a work schedule named ${existing.name}, update that schedule instead of creating a new one`,
        );
      }
    } else {
      const existing = await workScheduleModel.findDefault();

      if (existing) {
        throw Conflict(
          `A default schedule named ${existing.name} already exists, only one default schedule is allowed`,
        );
      }
    }

    assertScheduleTimesMakeSense({
      start_time: data.start_time ?? SCHEDULE_DEFAULTS.start_time,
      end_time: data.end_time ?? SCHEDULE_DEFAULTS.end_time,
      late_tolerance_minutes:
        data.late_tolerance_minutes ?? SCHEDULE_DEFAULTS.late_tolerance_minutes,
      absent_cutoff_time:
        data.absent_cutoff_time ?? SCHEDULE_DEFAULTS.absent_cutoff_time,
    });

    const schedule = await workScheduleModel.createSchedule(data);

    activity.success({
      action: "schedule.create",
      entity: "work_schedule",
      entity_id: schedule.id,
      summary: `Work schedule ${schedule.name} created`,
    });

    res.status(201).json({ success: true, data: schedule });
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
    const data = req.body as Partial<WorkScheduleInput>;

    const existing = await workScheduleModel.findById(id);
    if (!existing) throw NotFound("Work schedule not found");

    if (existing.department_id === null) {
      if (data.department_id) {
        throw BadRequest(
          "The default schedule cannot be moved to a department, create a new schedule for that department",
        );
      }

      if (data.is_active === false) {
        throw BadRequest(
          "The default schedule cannot be deactivated because it is the fallback for employees without their own schedule",
        );
      }
    }

    if (data.department_id && data.department_id !== existing.department_id) {
      const department = await departmentModel.findById(data.department_id);
      if (!department) throw BadRequest("Department not found");

      const duplicate = await workScheduleModel.findByDepartment(
        data.department_id,
      );

      if (duplicate) {
        throw Conflict(
          `Department ${department.name} already has a work schedule named ${duplicate.name}`,
        );
      }
    }

    assertScheduleTimesMakeSense({
      start_time: data.start_time ?? existing.start_time,
      end_time: data.end_time ?? existing.end_time,
      late_tolerance_minutes:
        data.late_tolerance_minutes ?? existing.late_tolerance_minutes,
      absent_cutoff_time:
        data.absent_cutoff_time ?? existing.absent_cutoff_time,
    });

    const schedule = await workScheduleModel.updateSchedule(id, data);

    activity.success({
      action: "schedule.update",
      entity: "work_schedule",
      entity_id: id,
      summary: `Work schedule ${existing.name} updated`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: schedule });
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

    if (existing.department_id === null) {
      throw BadRequest(
        "The default schedule cannot be deleted because it is the fallback for employees without their own schedule",
      );
    }

    const terpakai = await workScheduleModel.countEmployees(id);

    if (terpakai > 0) {
      throw Conflict(
        `This work schedule is still used by ${plural(terpakai, "employee")}, move them to another schedule first`,
        { employee_count: terpakai },
      );
    }

    await workScheduleModel.softDeleteSchedule(id);

    activity.success({
      action: "schedule.delete",
      entity: "work_schedule",
      entity_id: id,
      summary: `Work schedule ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Work schedule deleted successfully" });
  } catch (err) {
    next(err);
  }
}
