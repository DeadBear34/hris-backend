import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as employeeModel from "../models/employee.js";
import * as leaveTypeModel from "../models/leaveType.js";
import * as balanceModel from "../models/leaveBalance.js";
import type { ListLedgerParams } from "../models/leaveBalance.js";
import { BadRequest, NotFound, Unauthorized } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { plural } from "../helpers/plural.js";

function currentYear(): number {
  return new Date().getUTCFullYear();
}

async function getRequesterEmployee(req: Request) {
  if (!req.user)
    throw Unauthorized("You are not logged in, please log in first");

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Your account is not linked to an employee record yet, please contact an admin first",
    );
  }

  return employee;
}

export async function MyLeaveBalanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await getRequesterEmployee(req);
    const { period_year } = res.locals.query as { period_year?: number };
    const period = period_year ?? currentYear();

    const balances = await balanceModel.summaryFor(employee.id, period);

    res.json({
      success: true,
      data: { employee_id: employee.id, period_year: period, balances },
    });
  } catch (err) {
    next(err);
  }
}

export async function EmployeeLeaveBalanceController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const { period_year } = res.locals.query as { period_year?: number };
    const period = period_year ?? currentYear();

    const employee = await employeeModel.findById(id);
    if (!employee) throw NotFound("Employee not found");

    const balances = await balanceModel.summaryFor(employee.id, period);

    res.json({
      success: true,
      data: {
        employee_id: employee.id,
        employee_name: employee.full_name,
        period_year: period,
        balances,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function MyLeaveLedgerController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await getRequesterEmployee(req);
    const query = res.locals.query as Omit<ListLedgerParams, "employee_id">;

    const { rows, total } = await balanceModel.listLedger({
      ...query,
      employee_id: employee.id,
    });

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

export async function AdjustLeaveBalanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    if (!req.user)
      throw Unauthorized("You are not logged in, please log in first");

    const { employee_id, leave_type_id, period_year, amount, note } =
      req.body as {
        employee_id: string;
        leave_type_id: string;
        period_year: number;
        amount: number;
        note: string;
      };

    const employee = await employeeModel.findById(employee_id);
    if (!employee) throw BadRequest("Employee not found");

    const leaveType = await leaveTypeModel.findById(leave_type_id);
    if (!leaveType) throw BadRequest("Leave type not found");

    const pelaku = await employeeModel.findByUserId(req.user.id);

    const transaksi = await balanceModel.createTransaction(pool, {
      employee_id,
      leave_type_id,
      period_year,
      amount,
      type: "adjustment",
      note,
      created_by: pelaku?.id ?? null,
    });

    const saldo = await balanceModel.balanceFor(
      employee_id,
      leave_type_id,
      period_year,
    );

    activity.success({
      action: "leave.balance_adjust",
      entity: "employee",
      entity_id: employee_id,
      summary: `${leaveType.name} balance for ${employee.full_name} adjusted by ${amount > 0 ? "+" : ""}${plural(amount, "day")}`,
      metadata: { leave_type_id, period_year, amount, note: note ?? null },
    });

    res.status(201).json({
      success: true,
      message: "Leave balance adjusted successfully",
      data: { transaction: transaksi, balance: saldo },
    });
  } catch (err) {
    next(err);
  }
}
