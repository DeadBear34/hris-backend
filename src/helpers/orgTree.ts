import type {
  HolderRow,
  PositionRow,
  UnitRow,
} from "../models/orgStructure.js";

export interface HolderNode {
  id: string;
  employee_number: string;
  full_name: string;
}

export interface PositionNode {
  id: string;
  code: string;
  name: string;
  reports_to_position_id: string | null;
  is_unit_head: boolean;
  max_holders: number | null;
  is_active: boolean;
  holders: HolderNode[];
  // bawahan jabatan di unit yang sama. Kepala unit di bawahnya tampil di unit
  // anaknya, dengan reports_to_position_id yang menunjuk ke jabatan ini
  direct_reports: PositionNode[];
}

export interface UnitNode {
  id: string;
  code: string;
  name: string;
  unit_type: string;
  is_active: boolean;
  positions: PositionNode[];
  children: UnitNode[];
}

export interface OrgTree {
  units: UnitNode[];
  // jabatan lama yang belum dimasukkan ke unit mana pun
  unassigned_positions: PositionNode[];
}

// Menyusun bagan organisasi dari baris datar. Fungsi murni tanpa database,
// supaya bentuk pohonnya mudah diuji. Simpul yang induknya tidak ditemukan
// (misalnya induknya sudah dihapus) ditampilkan di puncak, bukan dibuang
export function buildOrgTree(
  units: UnitRow[],
  positions: PositionRow[],
  holders: HolderRow[],
): OrgTree {
  const holdersByPosition = new Map<string, HolderNode[]>();

  for (const holder of holders) {
    const list = holdersByPosition.get(holder.position_id) ?? [];
    list.push({
      id: holder.id,
      employee_number: holder.employee_number,
      full_name: holder.full_name,
    });
    holdersByPosition.set(holder.position_id, list);
  }

  const positionsById = new Map(positions.map((row) => [row.id, row]));
  const positionNodes = new Map<string, PositionNode>();
  for (const row of positions) {
    positionNodes.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      reports_to_position_id: row.reports_to_position_id,
      is_unit_head: row.is_unit_head,
      max_holders: row.max_holders,
      is_active: row.is_active,
      holders: holdersByPosition.get(row.id) ?? [],
      direct_reports: [],
    });
  }

  const unitNodes = new Map<string, UnitNode>();
  for (const row of units) {
    unitNodes.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      unit_type: row.unit_type,
      is_active: row.is_active,
      positions: [],
      children: [],
    });
  }

  const unassigned: PositionNode[] = [];

  for (const row of positions) {
    const node = positionNodes.get(row.id)!;
    const unit = row.department_id ? unitNodes.get(row.department_id) : null;

    if (!unit) {
      unassigned.push(node);
      continue;
    }

    const superior = row.reports_to_position_id
      ? positionsById.get(row.reports_to_position_id)
      : undefined;

    // Bawahan di unit yang sama digantung di bawah atasannya. Atasan di unit
    // lain (kepala unit melapor ke unit induk) berarti jabatan ini puncak unitnya
    if (superior && superior.department_id === row.department_id) {
      positionNodes.get(superior.id)!.direct_reports.push(node);
    } else {
      unit.positions.push(node);
    }
  }

  const roots: UnitNode[] = [];

  for (const row of units) {
    const node = unitNodes.get(row.id)!;
    const parent = row.parent_id ? unitNodes.get(row.parent_id) : null;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return { units: roots, unassigned_positions: unassigned };
}
