import type { Request, Response } from "express";
import * as employeeModel from "../models/employee.js";
import type { Employee } from "../models/employee.js";
import { BadRequest, Unauthorized } from "./appError.js";

// Data karyawan milik user yang login, diambil sekali per request. Middleware
// fitur dan controller sama-sama membutuhkannya, jadi hasilnya disimpan di
// res.locals supaya tidak ada query kedua
export async function findRequestEmployee(
  req: Request,
  res: Response,
): Promise<Employee | null> {
  const stored = res.locals.employee as Employee | undefined;
  if (stored) return stored;

  if (!req.user) return null;

  const employee = await employeeModel.findByUserId(req.user.id);
  if (employee) res.locals.employee = employee;

  return employee;
}

// Sama seperti di atas, tapi request langsung ditolak kalau belum login atau
// akunnya belum terhubung ke data karyawan
export async function requireRequestEmployee(
  req: Request,
  res: Response,
): Promise<Employee> {
  if (!req.user) {
    throw Unauthorized("You are not logged in, please log in first");
  }

  const employee = await findRequestEmployee(req, res);

  if (!employee) {
    throw BadRequest(
      "Your account is not linked to an employee record yet, please contact an admin first",
    );
  }

  return employee;
}
