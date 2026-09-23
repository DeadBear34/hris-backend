import type { Request, Response, NextFunction } from "express";
import * as activityLogModel from "../models/activityLog.js";

export async function ListActivityLogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = res.locals.query as activityLogModel.ListActivityLogParams;

    const { rows, total } = await activityLogModel.listLogs(query);

    res.json({
      success: true,
      data: rows,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}
