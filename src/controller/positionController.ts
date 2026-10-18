import type { Request, Response, NextFunction } from "express";
import * as positionModel from "../models/position.js";
import type { PositionInput } from "../models/position.js";
import { Conflict, NotFound, BadRequest } from "../helpers/appError.js";
import { startActivity } from "../helpers/activityLog.js";
import { rejectStaleUpdate } from "../helpers/concurrency.js";
import { plural } from "../helpers/plural.js";
import { withTransaction } from "../helpers/transaction.js";
import { assertPositionPlacement } from "../helpers/orgValidation.js";
import { countHolders } from "../models/orgStructure.js";
import { rerouteSafely } from "../helpers/approvalRouting.js";

export async function ListPositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const positions = await positionModel.findAll();
    res.json({ success: true, data: positions });
  } catch (err) {
    next(err);
  }
}

export async function DetailPositionController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = res.locals.params as { id: string };

    const position = await positionModel.findById(id);
    if (!position) throw NotFound("Position not found");

    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
}

export async function CreatePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const data = req.body as PositionInput & { department_id: string };

    // Kode dan nama unik per unit, bukan global
    const [existing, sameName] = await Promise.all([
      positionModel.findByCode(data.code, data.department_id),
      positionModel.findByName(data.name, data.department_id),
    ]);
    if (existing)
      throw Conflict("Position code is already in use in this unit");
    if (sameName)
      throw Conflict("Position name is already in use in this unit");

    await assertPositionPlacement({
      positionId: null,
      department_id: data.department_id,
      reports_to_position_id: data.reports_to_position_id ?? null,
      is_unit_head: data.is_unit_head ?? false,
    });

    const position = await positionModel.createPosition(data);

    activity.success({
      action: "position.create",
      entity: "position",
      entity_id: position.id,
      summary: `Position ${position.name} created`,
      metadata: {
        department_id: position.department_id,
        reports_to_position_id: position.reports_to_position_id,
        is_unit_head: position.is_unit_head,
      },
    });

    res.status(201).json({
      success: true,
      message: "Position created successfully",
      data: position,
    });
  } catch (err) {
    next(err);
  }
}

export async function UpdatePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };
    const { updated_at: expectedUpdatedAt, ...data } =
      req.body as Partial<PositionInput> & {
        updated_at?: string;
      };

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Position not found");

    // Keadaan setelah perubahan, dipakai untuk semua pemeriksaan di bawah
    const department_id = data.department_id ?? existing.department_id;
    const reports_to_position_id =
      data.reports_to_position_id !== undefined
        ? data.reports_to_position_id
        : existing.reports_to_position_id;
    const is_unit_head = data.is_unit_head ?? existing.is_unit_head;

    if (data.department_id === null) {
      throw BadRequest("A position must belong to a unit", {
        field: "department_id",
      });
    }

    const unitChanged =
      data.department_id !== undefined &&
      data.department_id !== existing.department_id;

    if ((data.code && data.code !== existing.code) || unitChanged) {
      const duplicate = await positionModel.findByCode(
        data.code ?? existing.code,
        department_id,
        id,
      );
      if (duplicate) {
        throw Conflict("Position code is already in use in this unit");
      }
    }

    if (data.name || unitChanged) {
      const sameName = await positionModel.findByName(
        data.name ?? existing.name,
        department_id,
        id,
      );
      if (sameName) {
        throw Conflict("Position name is already in use in this unit");
      }
    }

    const placementChanged =
      data.department_id !== undefined ||
      data.reports_to_position_id !== undefined ||
      data.is_unit_head !== undefined;

    if (placementChanged) {
      // Jabatan lama yang belum punya unit tidak boleh diberi atasan atau
      // dijadikan kepala unit sebelum unitnya ditentukan; tanpa ini seluruh
      // pemeriksaan struktur terlewati
      if (!department_id) {
        throw BadRequest("Assign this position to a unit first", {
          field: "department_id",
        });
      }

      // Bawahan jabatan ini yang bukan kepala unit akan melapor lintas unit
      // bila jabatannya dipindah ke unit lain (melanggar V3)
      if (unitChanged) {
        const reports = await positionModel.countDirectReports(id);

        if (reports > 0) {
          throw BadRequest(
            `Position cannot be moved to another unit while ${plural(reports, "position")} still report to it. Move them to another superior first.`,
            { field: "department_id", direct_report_count: reports },
          );
        }
      }

      await assertPositionPlacement({
        positionId: id,
        department_id,
        reports_to_position_id,
        is_unit_head,
      });
    }

    // Kuota kursi tidak boleh diturunkan di bawah jumlah pemegang sekarang
    if (data.max_holders !== undefined && data.max_holders !== null) {
      const holders = await countHolders(id);

      if (holders > data.max_holders) {
        throw BadRequest(
          `Maximum holders cannot be lower than the current ${plural(holders, "holder")}`,
          { field: "max_holders", holders },
        );
      }
    }

    if (data.is_active === false && existing.is_active) {
      const count = await positionModel.countEmployees(id);

      if (count > 0) {
        throw BadRequest(
          `Position cannot be deactivated because it is still used by ${plural(count, "employee")}`,
          { employee_count: count },
        );
      }
    }

    // Departemen pemegang jabatan diturunkan dari unit jabatannya, jadi ikut
    // disesuaikan dalam transaksi yang sama bila unitnya berpindah. Perubahan
    // lain cukup satu UPDATE tanpa transaksi
    const position = unitChanged
      ? await withTransaction(async (client) => {
          const updated = await positionModel.updatePosition(
            id,
            data,
            expectedUpdatedAt,
            client,
          );

          if (updated) {
            await positionModel.syncHolderDepartments(
              client,
              id,
              updated.department_id,
            );
          }

          return updated;
        })
      : await positionModel.updatePosition(id, data, expectedUpdatedAt);

    if (!position) {
      throw await rejectStaleUpdate(
        "position",
        () => positionModel.findById(id),
        "Position not found",
      );
    }

    // Atasan pemegang jabatan di cabang ini bisa berubah, jadi pengajuan cuti
    // yang masih menunggu dialihkan ke atasan yang berlaku sekarang
    const rerouted = placementChanged ? await rerouteSafely() : [];

    activity.success({
      action: "position.update",
      entity: "position",
      entity_id: id,
      summary: `Position ${existing.name} updated`,
      metadata: {
        fields: Object.keys(data),
        rerouted_leave_requests: rerouted.length,
      },
    });

    res.json({
      success: true,
      message: "Position updated successfully",
      data: position,
    });
  } catch (err) {
    next(err);
  }
}

export async function DeletePositionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activity = startActivity(req);
    const { id } = res.locals.params as { id: string };

    const existing = await positionModel.findById(id);
    if (!existing) throw NotFound("Position not found");

    const [count, reports] = await Promise.all([
      positionModel.countEmployees(id),
      positionModel.countDirectReports(id),
    ]);

    if (count > 0) {
      throw BadRequest(
        `Position cannot be deleted because it is still used by ${plural(count, "employee")}. Move them to another position first.`,
        { employee_count: count },
      );
    }

    // V6: bawahan jabatan ini akan kehilangan atasan
    if (reports > 0) {
      throw BadRequest(
        `Position cannot be deleted because ${plural(reports, "position")} still report to it. Move them to another superior first.`,
        { direct_report_count: reports },
      );
    }

    await positionModel.softDeletePosition(id);

    activity.success({
      action: "position.delete",
      entity: "position",
      entity_id: id,
      summary: `Position ${existing.name} deleted`,
    });

    res.json({ success: true, message: "Position deleted successfully" });
  } catch (err) {
    next(err);
  }
}
