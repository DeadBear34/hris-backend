import * as departmentModel from "../models/department.js";
import { MAX_TREE_DEPTH } from "./orgConstants.js";
import * as positionModel from "../models/position.js";
import type { Position } from "../models/position.js";
import { countHolders } from "../models/orgStructure.js";
import { BadRequest, Conflict } from "./appError.js";

// Aturan struktur organisasi. Setiap fungsi melempar AppError dengan pesan
// yang menyebut kolom yang bermasalah, supaya form frontend bisa menandainya.
// Nomor aturan (V1, V2, ...) sama dengan dokumen rancangan di README

// V1: unit tidak boleh menjadi induk dari dirinya atau keturunannya
export async function assertUnitParent(
  unitId: string | null,
  parentId: string | null | undefined,
): Promise<void> {
  if (!parentId) return;

  const parent = await departmentModel.findById(parentId);
  if (!parent) {
    throw BadRequest("Parent unit not found", { field: "parent_id" });
  }

  if (unitId && (await departmentModel.isUnitInSubtree(unitId, parentId))) {
    throw BadRequest(
      "A unit cannot be placed under itself or one of its own sub-units",
      { field: "parent_id" },
    );
  }
}

// V4 saat unit dipindah ke induk lain: kepala unit melapor ke jabatan di
// unit induknya. Bila jabatan atasannya tidak berada di jajaran induk yang
// baru, kepala unit harus dipindahkan atasannya lebih dulu
export async function assertUnitMove(
  unitId: string,
  newParentId: string | null | undefined,
): Promise<void> {
  const head = await positionModel.findUnitHead(unitId);
  if (!head?.reports_to_position_id) return;

  const superior = await positionModel.findById(head.reports_to_position_id);
  if (!superior?.department_id) return;

  const allowed = newParentId
    ? await departmentModel.findUnitAncestry(newParentId)
    : [];

  if (!allowed.includes(superior.department_id)) {
    throw BadRequest(
      `${head.name} (head of this unit) reports to ${superior.name}, which would no longer be in a parent unit. Change who ${head.name} reports to first`,
      { field: "parent_id", unit_head_id: head.id },
    );
  }
}

export interface PositionPlacement {
  // null saat membuat jabatan baru
  positionId: string | null;
  department_id: string;
  reports_to_position_id: string | null;
  is_unit_head: boolean;
}

// V2 sampai V5 dan V8 untuk letak sebuah jabatan di struktur
export async function assertPositionPlacement(
  placement: PositionPlacement,
): Promise<void> {
  const { positionId, department_id, reports_to_position_id, is_unit_head } =
    placement;

  const unit = await departmentModel.findById(department_id);
  if (!unit) {
    throw BadRequest("Unit not found", { field: "department_id" });
  }

  // Satu unit hanya punya satu kepala
  if (is_unit_head) {
    const head = await positionModel.findUnitHead(
      department_id,
      positionId ?? undefined,
    );

    if (head) {
      throw Conflict(`${unit.name} already has a head position: ${head.name}`, {
        field: "is_unit_head",
        existing_head_id: head.id,
      });
    }
  }

  // V5: hanya satu jabatan puncak tanpa atasan
  if (!reports_to_position_id) {
    const roots = await positionModel.findRoots(positionId ?? undefined);

    if (roots.length > 0) {
      throw BadRequest(
        `There can only be one top position (currently ${roots[0]!.name}). Choose who this position reports to`,
        { field: "reports_to_position_id" },
      );
    }

    return;
  }

  const superior = await positionModel.findById(reports_to_position_id);
  if (!superior) {
    throw BadRequest("Superior position not found", {
      field: "reports_to_position_id",
    });
  }

  // V2: tidak boleh melapor ke dirinya atau bawahannya sendiri
  if (
    positionId &&
    (await positionModel.isPositionInSubtree(positionId, superior.id))
  ) {
    throw BadRequest(
      "A position cannot report to itself or to one of its own subordinate positions",
      { field: "reports_to_position_id" },
    );
  }

  await assertSuperiorUnit(unit.id, unit.name, superior, is_unit_head);

  // V8: batas kedalaman
  if ((await positionModel.depthOf(superior.id)) + 1 > MAX_TREE_DEPTH) {
    throw BadRequest(
      `The hierarchy cannot be deeper than ${MAX_TREE_DEPTH} levels`,
      { field: "reports_to_position_id" },
    );
  }
}

// V3 dan V4: hubungan lintas unit hanya lewat kepala unit
//   - kepala unit melapor ke jabatan di unit induknya (atau lebih atas)
//   - jabatan lain melapor ke jabatan di unit yang sama
async function assertSuperiorUnit(
  unitId: string,
  unitName: string,
  superior: Position,
  is_unit_head: boolean,
): Promise<void> {
  if (!superior.department_id) {
    throw BadRequest(
      "The superior position is not assigned to any unit yet. Assign it to a unit first",
      { field: "reports_to_position_id" },
    );
  }

  if (!is_unit_head) {
    if (superior.department_id !== unitId) {
      throw BadRequest(
        `Only the head of ${unitName} may report to a position outside the unit. Other positions must report to a position in ${unitName}`,
        { field: "reports_to_position_id" },
      );
    }

    return;
  }

  // findUnitAncestry dimulai dari unit itu sendiri, jadi induknya mulai indeks 1
  const ancestors = (await departmentModel.findUnitAncestry(unitId)).slice(1);

  if (!ancestors.includes(superior.department_id)) {
    throw BadRequest(
      `The head of ${unitName} must report to a position in one of its parent units`,
      { field: "reports_to_position_id" },
    );
  }
}

// V7: jumlah pemegang tidak melebihi kuota kursi
export async function assertPositionCapacity(
  position: Position,
  exceptEmployeeId?: string,
  incoming = 1,
): Promise<void> {
  // null maupun undefined berarti tanpa batas
  if (position.max_holders == null) return;

  const holders = await countHolders(position.id, exceptEmployeeId);

  if (holders + incoming > position.max_holders) {
    throw Conflict(
      `${position.name} is limited to ${position.max_holders} holder(s) and is already full`,
      {
        field: "position_id",
        max_holders: position.max_holders,
        holders,
      },
    );
  }
}
