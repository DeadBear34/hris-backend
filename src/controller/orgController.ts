// baru: endpoint bagan organisasi & atasan langsung
import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import { findLineManager, loadOrgChart } from "../models/orgStructure.js";
import { buildOrgTree } from "../helpers/orgTree.js";
import { NotFound } from "../helpers/appError.js";

// Bagan organisasi lengkap: unit bertingkat, jabatan per unit beserta
// atasan jabatannya, dan pemegang tiap jabatan
export async function OrgTreeController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { units, positions, holders } = await loadOrgChart();

    res.json({ success: true, data: buildOrgTree(units, positions, holders) });
  } catch (err) {
    next(err);
  }
}

// Atasan langsung seorang karyawan beserta asal hitungannya. Dipakai untuk
// menampilkan atasan di profil dan menelusuri kenapa sebuah pengajuan cuti
// masuk ke penyetuju tertentu
export async function LineManagerController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const employee = await employeeModel.findById(id);
    if (!employee) throw NotFound("Employee not found");

    const manager = await findLineManager(id);

    res.json({
      success: true,
      data: {
        employee_id: id,
        // null berarti tidak ada atasan aktif sampai puncak; cutinya
        // ditangani pemegang leave.approve_all dan admin
        line_manager: manager
          ? {
              employee_id: manager.employee_id,
              full_name: manager.full_name,
              position_id: manager.position_id,
              position_name: manager.position_name,
              source: manager.source,
              levels_up: manager.levels_up,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
