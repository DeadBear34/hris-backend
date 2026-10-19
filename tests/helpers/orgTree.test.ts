import { describe, it, expect } from "@jest/globals";
import { buildOrgTree } from "../../src/helpers/orgTree.js";

function unit(id: string, parent_id: string | null, unit_type = "department") {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    parent_id,
    unit_type,
    is_active: true,
  };
}

function position(
  id: string,
  department_id: string | null,
  reports_to_position_id: string | null,
  is_unit_head = false,
) {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    department_id,
    reports_to_position_id,
    is_unit_head,
    max_holders: null,
    is_active: true,
  };
}

// PT -> Teknologi -> Engineering
const units = [
  unit("pt", null, "company"),
  unit("tech", "pt", "directorate"),
  unit("eng", "tech"),
];

const positions = [
  position("ceo", "pt", null, true),
  position("cto", "tech", "ceo", true),
  position("head-eng", "eng", "cto", true),
  position("senior", "eng", "head-eng"),
  position("junior", "eng", "senior"),
];

describe("buildOrgTree", () => {
  const tree = buildOrgTree(units, positions, [
    {
      id: "e1",
      employee_number: "001",
      full_name: "Rizky",
      position_id: "junior",
    },
    {
      id: "e2",
      employee_number: "002",
      full_name: "Dewi",
      position_id: "junior",
    },
  ]);

  it("menyusun unit bertingkat dari unit puncak", () => {
    expect(tree.units).toHaveLength(1);
    expect(tree.units[0]!.id).toBe("pt");
    expect(tree.units[0]!.children[0]!.id).toBe("tech");
    expect(tree.units[0]!.children[0]!.children[0]!.id).toBe("eng");
  });

  it("kepala unit tampil di puncak unitnya sendiri walau atasannya di unit induk", () => {
    const eng = tree.units[0]!.children[0]!.children[0]!;

    expect(eng.positions.map((p) => p.id)).toEqual(["head-eng"]);
    expect(eng.positions[0]!.reports_to_position_id).toBe("cto");
  });

  it("bawahan di unit yang sama digantung di bawah atasannya", () => {
    const head = tree.units[0]!.children[0]!.children[0]!.positions[0]!;

    expect(head.direct_reports.map((p) => p.id)).toEqual(["senior"]);
    expect(head.direct_reports[0]!.direct_reports.map((p) => p.id)).toEqual([
      "junior",
    ]);
  });

  it("satu jabatan bisa dipegang beberapa orang", () => {
    const junior =
      tree.units[0]!.children[0]!.children[0]!.positions[0]!.direct_reports[0]!
        .direct_reports[0]!;

    expect(junior.holders.map((h) => h.full_name)).toEqual(["Rizky", "Dewi"]);
  });

  it("jabatan kosong tetap tampil dengan daftar pemegang kosong", () => {
    expect(tree.units[0]!.positions[0]!.holders).toEqual([]);
  });

  it("jabatan lama tanpa unit dipisahkan, tidak dibuang", () => {
    const result = buildOrgTree(units, [position("lama", null, null)], []);

    expect(result.unassigned_positions.map((p) => p.id)).toEqual(["lama"]);
  });

  it("unit yang induknya tidak ditemukan tampil di puncak", () => {
    const result = buildOrgTree([unit("yatim", "hilang")], [], []);

    expect(result.units.map((u) => u.id)).toEqual(["yatim"]);
  });
});
