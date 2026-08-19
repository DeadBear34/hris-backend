import type { Request, Response, NextFunction } from "express";
import * as workScheduleModel from "../models/workSchedule.js";
import * as departmentModel from "../models/department.js";
import * as employeeModel from "../models/employee.js";
import type { WorkScheduleInput } from "../models/workSchedule.js";
import { menitDariJam } from "../helpers/timezone.js";
import { BadRequest, Conflict, NotFound, Unauthorized } from "../helpers/appError.js";

const BAWAAN = {
  start_time: "08:00",
  end_time: "18:00",
  late_tolerance_minutes: 5,
  absent_cutoff_time: "18:00",
} as const;

function pastikanJamMasukAkal(jam: {
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  absent_cutoff_time: string;
}): void {
  if (jam.end_time <= jam.start_time) {
    throw BadRequest(
      `Jam pulang ${jam.end_time} harus lebih besar daripada jam masuk ${jam.start_time}`,
    );
  }

  const batasTerlambat =
    menitDariJam(jam.start_time) + jam.late_tolerance_minutes;
  const menitTutup = menitDariJam(jam.absent_cutoff_time);

  if (menitTutup <= batasTerlambat) {
    throw BadRequest(
      `Batas absen ${jam.absent_cutoff_time} harus melewati akhir toleransi keterlambatan, yaitu ${jam.late_tolerance_minutes} menit setelah jam masuk ${jam.start_time}`,
    );
  }

  if (menitTutup > menitDariJam(jam.end_time)) {
    throw BadRequest(
      `Batas absen ${jam.absent_cutoff_time} tidak boleh melewati jam pulang ${jam.end_time}`,
    );
  }
}

export async function ListWorkScheduleController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const schedules = await workScheduleModel.findAll();

    res.json({ success: true, data: schedules });
  } catch (err) {
    next(err);
  }
}

export async function MyWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      throw Unauthorized("Kamu belum login, silakan masuk terlebih dahulu");
    }

    const employee = await employeeModel.findByUserId(req.user.id);
    if (!employee) {
      throw BadRequest(
        "Akun kamu belum terhubung ke data karyawan, hubungi admin terlebih dahulu",
      );
    }

    const schedule = await workScheduleModel.resolveForEmployee(employee.id);
    if (!schedule) {
      throw NotFound(
        "Belum ada jadwal kerja yang berlaku untukmu, hubungi admin",
      );
    }

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

export async function DetailWorkScheduleController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const schedule = await workScheduleModel.findById(id);
    if (!schedule) throw NotFound("Jadwal kerja tidak ditemukan");

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

export async function CreateWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = req.body as WorkScheduleInput;

    if (data.department_id) {
      const department = await departmentModel.findById(data.department_id);
      if (!department) throw BadRequest("Departemen tidak ditemukan");

      const existing = await workScheduleModel.findByDepartment(
        data.department_id,
      );

      if (existing) {
        throw Conflict(
          `Departemen ${department.name} sudah memiliki jadwal kerja bernama ${existing.name}, ubah jadwal tersebut alih-alih membuat yang baru`,
        );
      }
    } else {
      const existing = await workScheduleModel.findDefault();

      if (existing) {
        throw Conflict(
          `Jadwal bawaan sudah ada dengan nama ${existing.name}, hanya boleh ada satu jadwal bawaan`,
        );
      }
    }

    pastikanJamMasukAkal({
      start_time: data.start_time ?? BAWAAN.start_time,
      end_time: data.end_time ?? BAWAAN.end_time,
      late_tolerance_minutes:
        data.late_tolerance_minutes ?? BAWAAN.late_tolerance_minutes,
      absent_cutoff_time: data.absent_cutoff_time ?? BAWAAN.absent_cutoff_time,
    });

    const schedule = await workScheduleModel.createSchedule(data);

    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

export async function UpdateWorkScheduleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };
    const data = req.body as Partial<WorkScheduleInput>;

    const existing = await workScheduleModel.findById(id);
    if (!existing) throw NotFound("Jadwal kerja tidak ditemukan");

    if (existing.department_id === null) {
      if (data.department_id) {
        throw BadRequest(
          "Jadwal bawaan tidak dapat dipindahkan ke satu departemen, buat jadwal baru untuk departemen tersebut",
        );
      }

      if (data.is_active === false) {
        throw BadRequest(
          "Jadwal bawaan tidak dapat dinonaktifkan karena menjadi cadangan terakhir bagi karyawan tanpa jadwal khusus",
        );
      }
    }

    if (
      data.department_id &&
      data.department_id !== existing.department_id
    ) {
      const department = await departmentModel.findById(data.department_id);
      if (!department) throw BadRequest("Departemen tidak ditemukan");

      const duplicate = await workScheduleModel.findByDepartment(
        data.department_id,
      );

      if (duplicate) {
        throw Conflict(
          `Departemen ${department.name} sudah memiliki jadwal kerja bernama ${duplicate.name}`,
        );
      }
    }

    pastikanJamMasukAkal({
      start_time: data.start_time ?? existing.start_time,
      end_time: data.end_time ?? existing.end_time,
      late_tolerance_minutes:
        data.late_tolerance_minutes ?? existing.late_tolerance_minutes,
      absent_cutoff_time:
        data.absent_cutoff_time ?? existing.absent_cutoff_time,
    });

    const schedule = await workScheduleModel.updateSchedule(id, data);

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

export async function DeleteWorkScheduleController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const existing = await workScheduleModel.findById(id);
    if (!existing) throw NotFound("Jadwal kerja tidak ditemukan");

    if (existing.department_id === null) {
      throw BadRequest(
        "Jadwal bawaan tidak dapat dihapus karena menjadi cadangan terakhir bagi karyawan tanpa jadwal khusus",
      );
    }

    const terpakai = await workScheduleModel.countEmployees(id);

    if (terpakai > 0) {
      throw Conflict(
        `Jadwal kerja ini masih dipakai ${terpakai} karyawan, pindahkan mereka ke jadwal lain terlebih dahulu`,
        { employee_count: terpakai },
      );
    }

    await workScheduleModel.softDeleteSchedule(id);

    res.json({ success: true, message: "Jadwal kerja berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
