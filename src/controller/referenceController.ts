import type { Request, Response, NextFunction } from "express";
import * as departmentModel from "../models/department.js";
import * as positionModel from "../models/position.js";

export async function ListDepartmentController(_req: Request, res: Response, next: NextFunction) {
  try {
    const departments = await departmentModel.findAll();
    res.json({ success: true, data: departments });
  } catch (err) {
    next(err);
  }
}

export async function ListPositionController(_req: Request, res: Response, next: NextFunction) {
  try {
    const positions = await positionModel.findAll();
    res.json({ success: true, data: positions });
  } catch (err) {
    next(err);
  }
}