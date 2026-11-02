import type { Request, Response, NextFunction } from "express";
import * as activityLogModel from "../models/activityLog.js";
import { paginated } from "../helpers/pagination.js";

export async function ListActivityLogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as activityLogModel.ListActivityLogParams;

    const { rows, total } = await activityLogModel.listLogs(query);

    res.json(paginated(rows, total, query));
  } catch (err) {
    next(err);
  }
}
