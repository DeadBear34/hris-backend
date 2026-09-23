import type { Request, Response, NextFunction } from "express";
import * as leaveTypeModel from "../models/leaveType.js";
import type { LeaveTypeInput } from "../models/leaveType.js";
import { BadRequest, Conflict, NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";

export async function ListLeaveTypeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const leaveTypes = await leaveTypeModel.findAll();

    res.json({ success: true, data: leaveTypes });
  } catch (err) {
    next(err);
  }
}

export async function DetailLeaveTypeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const leaveType = await leaveTypeModel.findById(id);
    if (!leaveType) throw NotFound("Leave type not found");

    res.json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

export async function CreateLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as LeaveTypeInput;

    const existing = await leaveTypeModel.findByCode(data.code);
    if (existing) throw Conflict("Leave type code is already in use");

    const leaveType = await leaveTypeModel.createLeaveType(data);

    activity.success({
      action: "leave_type.create",
      entity: "leave_type",
      entity_id: leaveType.id,
      summary: `Leave type ${leaveType.name} created`,
    });

    res.status(201).json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

export async function UpdateLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { updated_at: expectedUpdatedAt, ...data } =
      req.body as Partial<LeaveTypeInput> & {
        updated_at?: string;
      };

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Leave type not found");

    if (data.code && data.code !== existing.code) {
      const duplicate = await leaveTypeModel.findByCode(data.code);
      if (duplicate) throw Conflict("Leave type code is already in use");
    }

    const leaveType = await leaveTypeModel.updateLeaveType(
      id,
      data,
      expectedUpdatedAt,
    );

    if (!leaveType) {
      throw await rejectStaleUpdate(
        "leave_type",
        () => leaveTypeModel.findById(id),
        "Leave type not found",
      );
    }

    activity.success({
      action: "leave_type.update",
      entity: "leave_type",
      entity_id: id,
      summary: `Leave type ${existing.name} updated`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: leaveType });
  } catch (err) {
    next(err);
  }
}

export async function DeleteLeaveTypeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await leaveTypeModel.findById(id);
    if (!existing) throw NotFound("Leave type not found");

    const count = await leaveTypeModel.countLeaveRequests(id);
    if (count > 0) {
      throw BadRequest(
        `Leave type cannot be deleted because it is used by ${plural(count, "request")}. Deactivate it instead so it can no longer be selected.`,
        { leave_request_count: count },
      );
    }

    await leaveTypeModel.softDeleteLeaveType(id);

    activity.success({
      action: "leave_type.delete",
      entity: "leave_type",
      entity_id: id,
      summary: `Leave type ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Leave type deleted successfully" });
  } catch (err) {
    next(err);
  }
}
