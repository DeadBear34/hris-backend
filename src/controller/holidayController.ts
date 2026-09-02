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
    if (!holiday) throw NotFound("Hari libur tidak ditemukan");

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
    if (existing) throw Conflict("Tanggal tersebut sudah terdaftar hari libur");

    const holiday = await holidayModel.createHoliday(data);

    activity.success({
      action: "holiday.create",
      entity: "holiday",
      entity_id: holiday.id,
      summary: `Hari libur ${holiday.name} dibuat`,
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
    if (!existing) throw NotFound("Hari libur tidak ditemukan");

    if (data.holiday_date && data.holiday_date !== existing.holiday_date) {
      const duplicate = await holidayModel.findByDate(data.holiday_date);
      if (duplicate) {
        throw Conflict("Tanggal tersebut sudah terdaftar hari libur");
      }
    }

    const holiday = await holidayModel.updateHoliday(id, data);

    activity.success({
      action: "holiday.update",
      entity: "holiday",
      entity_id: id,
      summary: `Hari libur ${existing.name} diubah`,
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
    if (!existing) throw NotFound("Hari libur tidak ditemukan");

    await holidayModel.deleteHoliday(id);

    activity.success({
      action: "holiday.delete",
      entity: "holiday",
      entity_id: id,
      summary: `Hari libur ${existing.name} dihapus`,
    });

    res.json({ success: true, message: "Hari libur berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
