import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import type { ListParams } from "../models/employee.js";

export async function ListEmployeeController(req: Request, res: Response, next: NextFunction) {
    try {
        const query = res.locals.query as ListParams;
        const { rows, total } = await employeeModel.listEmployees(query);
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