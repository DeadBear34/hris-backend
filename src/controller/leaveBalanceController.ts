import type { Request, Response, NextFunction } from "express";
import { withTransaction } from "../helpers/transaction.js";
import * as employeeModel from "../models/employee.js";
import * as leaveTypeModel from "../models/leaveType.js";
import * as balanceModel from "../models/leaveBalance.js";
import type { ListLedgerParams } from "../models/leaveBalance.js";
import { BadRequest, NotFound, Unauthorized } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { plural } from "../helpers/plural.js";
import {
  findRequestEmployee,
  requireRequestEmployee,
} from "../helpers/requestEmployee.js";
import {
  currentLeaveYear,
  ensureAccruals,
  isAccrualYear,
} from "../helpers/leaveAccrual.js";

export async function MyLeaveBalanceController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const employee = await requireRequestEmployee(req, res);
    const { period_year } = res.locals.query as { period_year?: number };
    const period = period_year ?? currentLeaveYear();

    await ensureAccruals(employee.id, period);
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
    const period = period_year ?? currentLeaveYear();

    const employee = await employeeModel.findById(id);
    if (!employee) throw NotFound("Employee not found");

    await ensureAccruals(employee.id, period);
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
    const employee = await requireRequestEmployee(req, res);
    const query = res.locals.query as Omit<ListLedgerParams, "employee_id">;

    // Supaya jatah tahun berjalan ikut tampil di riwayat walau karyawan
    // belum pernah membuka saldo atau mengajukan cuti
    await ensureAccruals(employee.id, query.period_year ?? currentLeaveYear());

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

    const actor = await findRequestEmployee(req, res);

    // Dikunci sama seperti pengajuan cuti, supaya penyesuaian dan pengajuan
    // yang datang bersamaan tidak menghitung saldo dari angka lama
    const { transaction, balance } = await withTransaction(async (client) => {
      await balanceModel.lockEmployeeBalance(client, employee_id);

      // Jatah tahunan dipastikan ada lebih dulu, supaya pengurangan oleh admin
      // dihitung dari saldo yang sebenarnya, bukan dari nol
      if (isAccrualYear(period_year)) {
        await balanceModel.grantAccruals(client, [employee_id], period_year);
      }

      const created = await balanceModel.createTransaction(client, {
        employee_id,
        leave_type_id,
        period_year,
        amount,
        type: "adjustment",
        note,
        created_by: actor?.id ?? null,
      });

      const remaining = await balanceModel.balanceFor(
        employee_id,
        leave_type_id,
        period_year,
        client,
      );

      // Saldo hanya boleh berkurang lewat pengajuan cuti, yang sudah memeriksa
      // kecukupannya lebih dulu. Penyesuaian manual yang menambah tetap
      // diizinkan walau saldonya sedang minus, supaya saldo yang terlanjur
      // salah masih dapat diperbaiki
      if (amount < 0 && remaining < 0) {
        const available = remaining - amount;

        throw BadRequest(
          `Adjustment rejected because it would make the balance negative. The remaining balance is ${plural(available, "day")}`,
          {
            current_balance: available,
            requested_amount: amount,
            max_deduction: Math.max(0, available),
          },
        );
      }

      return { transaction: created, balance: remaining };
    });

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
      data: { transaction, balance },
    });
  } catch (err) {
    next(err);
  }
}
