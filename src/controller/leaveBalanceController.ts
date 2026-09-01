import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/databaseConnection.js";
import * as employeeModel from "../models/employee.js";
import * as leaveTypeModel from "../models/leaveType.js";
import * as balanceModel from "../models/leaveBalance.js";
import type { ListLedgerParams } from "../models/leaveBalance.js";
import { BadRequest, NotFound, Unauthorized } from "../helpers/appError.js";

function tahunBerjalan(): number {
  return new Date().getUTCFullYear();
}

async function getRequesterEmployee(req: Request) {
  if (!req.user)
    throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

  const employee = await employeeModel.findByUserId(req.user.id);

  if (!employee) {
    throw BadRequest(
      "Akun kamu belum terhubung ke data karyawan, hubungi admin terlebih dahulu",
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
    const periode = period_year ?? tahunBerjalan();

    const balances = await balanceModel.summaryFor(employee.id, periode);

    res.json({
      success: true,
      data: { employee_id: employee.id, period_year: periode, balances },
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
    const periode = period_year ?? tahunBerjalan();

    const employee = await employeeModel.findById(id);
    if (!employee) throw NotFound("Karyawan tidak ditemukan");

    const balances = await balanceModel.summaryFor(employee.id, periode);

    res.json({
      success: true,
      data: {
        employee_id: employee.id,
        employee_name: employee.full_name,
        period_year: periode,
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
    if (!req.user)
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");

    const { employee_id, leave_type_id, period_year, amount, note } =
      req.body as {
        employee_id: string;
        leave_type_id: string;
        period_year: number;
        amount: number;
        note: string;
      };

    const employee = await employeeModel.findById(employee_id);
    if (!employee) throw BadRequest("Karyawan tidak ditemukan");

    const leaveType = await leaveTypeModel.findById(leave_type_id);
    if (!leaveType) throw BadRequest("Jenis cuti tidak ditemukan");

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

    res.status(201).json({
      success: true,
      message: "Saldo cuti berhasil disesuaikan",
      data: { transaction: transaksi, balance: saldo },
    });
  } catch (err) {
    next(err);
  }
}
