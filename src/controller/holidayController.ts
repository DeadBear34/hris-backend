import type { Request, Response, NextFunction } from "express";
import * as holidayModel from "../models/holiday.js";
import type { HolidayInput, ListHolidayParams } from "../models/holiday.js";
import { Conflict, NotFound } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";

export async function ListHolidayController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as ListHolidayParams;
    const { rows, total } = await holidayModel.listHolidays(query);

    res.json({
      success: true,
      data: rows,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function DetailHolidayController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const holiday = await holidayModel.findById(id);
    if (!holiday) throw NotFound("Holiday not found");

    res.json({ success: true, data: holiday });
  } catch (err) {
    next(err);
  }
}

export async function CreateHolidayController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as HolidayInput;

    const existing = await holidayModel.findByDate(data.holiday_date);
    if (existing)
      throw Conflict("That date is already registered as a holiday");

    const holiday = await holidayModel.createHoliday(data);

    activity.success({
      action: "holiday.create",
      entity: "holiday",
      entity_id: holiday.id,
      summary: `Holiday ${holiday.name} created`,
    });

    res.status(201).json({ success: true, data: holiday });
  } catch (err) {
    next(err);
  }
}

export async function UpdateHolidayController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<HolidayInput>;

    const existing = await holidayModel.findById(id);
    if (!existing) throw NotFound("Holiday not found");

    if (data.holiday_date && data.holiday_date !== existing.holiday_date) {
      const duplicate = await holidayModel.findByDate(data.holiday_date);
      if (duplicate) {
        throw Conflict("That date is already registered as a holiday");
      }
    }

    const holiday = await holidayModel.updateHoliday(id, data);

    activity.success({
      action: "holiday.update",
      entity: "holiday",
      entity_id: id,
      summary: `Holiday ${existing.name} updated`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: holiday });
  } catch (err) {
    next(err);
  }
}

export async function DeleteHolidayController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await holidayModel.findById(id);
    if (!existing) throw NotFound("Holiday not found");

    await holidayModel.deleteHoliday(id);

    activity.success({
      action: "holiday.delete",
      entity: "holiday",
      entity_id: id,
      summary: `Holiday ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Holiday deleted successfully" });
  } catch (err) {
    next(err);
  }
}
