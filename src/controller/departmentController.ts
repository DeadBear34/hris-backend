import type { Request, Response, NextFunction } from "express";
import * as departmentModel from "../models/department.js";
import type { DepartmentInput } from "../models/department.js";
import { Conflict, NotFound, BadRequest } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";

export async function ListDepartmentController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const departments = await departmentModel.findAll();
    res.json({ success: true, data: departments });
  } catch (err) {
    next(err);
  }
}

export async function DetailDepartmentController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const department = await departmentModel.findById(id);
    if (!department) throw NotFound("Department not found");

    res.json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
}

export async function CreateDepartmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as DepartmentInput;

    const existing = await departmentModel.findByCode(data.code);
    if (existing) throw Conflict("Department code is already in use");

    const department = await departmentModel.createDepartment(data);

    activity.success({
      action: "department.create",
      entity: "department",
      entity_id: department.id,
      summary: `Department ${department.name} created`,
    });

    res.status(201).json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
}

export async function UpdateDepartmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { updated_at: expectedUpdatedAt, ...data } =
      req.body as Partial<DepartmentInput> & {
        updated_at?: string;
      };

    const existing = await departmentModel.findById(id);
    if (!existing) throw NotFound("Department not found");

    if (data.code && data.code !== existing.code) {
      const duplicate = await departmentModel.findByCode(data.code);
      if (duplicate) throw Conflict("Department code is already in use");
    }

    if (data.is_active === false && existing.is_active) {
      const count = await departmentModel.countEmployees(id);

      if (count > 0) {
        throw BadRequest(
          `Department cannot be deactivated because it still has ${plural(count, "employee")}`,
          { employee_count: count },
        );
      }
    }

    const department = await departmentModel.updateDepartment(
      id,
      data,
      expectedUpdatedAt,
    );

    if (!department) {
      throw await rejectStaleUpdate(
        "department",
        () => departmentModel.findById(id),
        "Department not found",
      );
    }

    activity.success({
      action: "department.update",
      entity: "department",
      entity_id: id,
      summary: `Department ${existing.name} updated`,
      metadata: { fields: Object.keys(data) },
    });

    res.json({ success: true, data: department });
  } catch (err) {
    next(err);
  }
}

export async function DeleteDepartmentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await departmentModel.findById(id);
    if (!existing) throw NotFound("Department not found");

    const count = await departmentModel.countEmployees(id);
    if (count > 0) {
      throw BadRequest(
        `Department cannot be deleted because it still has ${plural(count, "employee")}. Move them to another department first.`,
        { employee_count: count },
      );
    }

    await departmentModel.softDeleteDepartment(id);

    activity.success({
      action: "department.delete",
      entity: "department",
      entity_id: id,
      summary: `Department ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Department deleted successfully" });
  } catch (err) {
    next(err);
  }
}
