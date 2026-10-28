import type { Request, Response, NextFunction } from "express";
import * as employeeModel from "../models/employee.js";
import * as positionModel from "../models/position.js";
import {
  findLineManager,
  findLineManagerForPosition,
  loadOrgChart,
  type LineManager,
} from "../models/orgStructure.js";
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

// user_id sengaja tidak ikut dikirim ke klien
function lineManagerView(manager: LineManager | null) {
  return manager
    ? {
        employee_id: manager.employee_id,
        full_name: manager.full_name,
        position_id: manager.position_id,
        position_name: manager.position_name,
        source: manager.source,
        levels_up: manager.levels_up,
      }
    : null;
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
        line_manager: lineManagerView(manager),
      },
    });
  } catch (err) {
    next(err);
  }
}

// Atasan yang akan didapat pemegang jabatan ini menurut struktur. Dipakai
// form tambah dan ubah karyawan untuk mengisi atasan otomatis begitu jabatan
// dipilih, sebelum datanya disimpan. Pengecualian manual (manager_id) tidak
// dihitung di sini karena nilainya ada di form itu sendiri
export async function PositionLineManagerController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const { exclude_employee_id } = (res.locals.query ?? {}) as {
      exclude_employee_id?: string;
    };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    const manager = await findLineManagerForPosition(id, exclude_employee_id);

    res.json({
      success: true,
      data: {
        position_id: id,
        // null berarti tidak ada atasan aktif sampai puncak; cutinya
        // ditangani pemegang leave.approve_all dan admin
        line_manager: lineManagerView(manager),
      },
    });
  } catch (err) {
    next(err);
  }
}
