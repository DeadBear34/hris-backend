import type { Request, Response, NextFunction } from "express";
import * as positionModel from "../models/position.js";
import type { PositionInput } from "../models/position.js";
import { Conflict, NotFound, BadRequest } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { plural } from "../helpers/plural.js";

export async function ListPositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const positions = await positionModel.findAll();
    res.json({ success: true, data: positions });
  } catch (err) {
    next(err);
  }
}

export async function DetailPositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function CreatePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as PositionInput;

    const existing = await positionModel.findByCode(data.code);
    if (existing) throw Conflict("Position code is already in use");

    const position = await positionModel.createPosition(data);

    activity.success({
      action: "position.create",
      entity: "position",
      entity_id: position.id,
      summary: `Position ${position.name} created`,
    });

    res.status(201).json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function UpdatePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<PositionInput>;

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Position not found");

    if (data.code && data.code !== existing.code) {
      const duplicate = await positionModel.findByCode(data.code);
      if (duplicate) throw Conflict("Position code is already in use");
    }

    if (data.is_active === false && existing.is_active) {
      const count = await positionModel.countEmployees(id);

      if (count > 0) {
        throw BadRequest(
          `Position cannot be deactivated because it is still used by ${plural(count, "employee")}`,
          { employee_count: count },
        );
      }
    }

    const position = await positionModel.updatePosition(id, data);

    activity.success({
      action: "position.update",
      entity: "position",
      entity_id: id,
      summary: `Position ${existing.name} updated`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function DeletePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Position not found");

    const count = await positionModel.countEmployees(id);
    if (count > 0) {
      throw BadRequest(
        `Position cannot be deleted because it is still used by ${plural(count, "employee")}. Move them to another position first.`,
        { employee_count: count },
      );
    }

    await positionModel.softDeletePosition(id);

    activity.success({
      action: "position.delete",
      entity: "position",
      entity_id: id,
      summary: `Position ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Position deleted successfully" });
  } catch (err) {
    next(err);
  }
}
