import { describe, it, expect } from "@jest/globals";
import {
  FEATURE_REQUIRES,
  SENSITIVE_FEATURES,
  missingRequirements,
  diffCodes,
} from "../../src/helpers/accessRules.js";

// Isi paket standar di migrasi dan schema.sql. Semuanya harus lolos aturan
const STANDARD_PROFILES: Record<string, string[]> = {
  line_manager: ["leave.approve_team", "attendance.view_team"],
  executive: [
    "leave.approve_team",
    "attendance.view_team",
    "employee.view_all",
    "leave.view_all",
    "attendance.view_all",
  ],
  hr_viewer: ["employee.view_all", "leave.view_all", "attendance.view_all"],
  hr_staff: [
    "employee.view_all",
    "employee.create",
    "employee.update",
    "leave.view_all",
    "attendance.view_all",
    "attendance.report",
  ],
  hr_manager: [
    "leave.approve_team",
    "attendance.view_team",
    "employee.view_all",
    "employee.create",
    "employee.update",
    "employee.approve_user",
    "organization.manage",
    "organization.holiday",
    "leave.approve_all",
    "leave.view_all",
    "leave.manage_type",
    "leave.adjust_balance",
    "attendance.view_all",
    "attendance.correct",
    "attendance.report",
    "system.view_log",
  ],
};

describe("aturan fitur yang saling membutuhkan", () => {
  it("fitur tanpa ketergantungan selalu lolos", () => {
    expect(missingRequirements(["leave.approve_team"])).toEqual([]);
    expect(missingRequirements([])).toEqual([]);
  });

  it("melaporkan fitur dasar yang belum dicentang", () => {
    expect(
      missingRequirements(["employee.update", "attendance.correct"]),
    ).toEqual([
      { code: "employee.update", requires: ["employee.view_all"] },
      { code: "attendance.correct", requires: ["attendance.view_all"] },
    ]);
  });

  it("lolos bila fitur dasarnya ikut dicentang", () => {
    expect(
      missingRequirements(["employee.update", "employee.view_all"]),
    ).toEqual([]);
  });

  it("semua paket standar memenuhi aturan", () => {
    for (const [code, codes] of Object.entries(STANDARD_PROFILES)) {
      expect({ code, missing: missingRequirements(codes) }).toEqual({
        code,
        missing: [],
      });
    }
  });

  it("fitur dasar tidak membutuhkan fitur lain, jadi tidak ada lingkaran", () => {
    for (const required of Object.values(FEATURE_REQUIRES).flat()) {
      expect(FEATURE_REQUIRES[required]).toBeUndefined();
    }
  });

  it("fitur yang bisa mengubah data orang banyak ditandai sensitif", () => {
    expect(SENSITIVE_FEATURES.has("employee.delete")).toBe(true);
    expect(SENSITIVE_FEATURES.has("leave.adjust_balance")).toBe(true);
    expect(SENSITIVE_FEATURES.has("leave.approve_team")).toBe(false);
  });
});

describe("perbedaan daftar fitur", () => {
  it("memisahkan yang ditambah dan yang dicabut", () => {
    expect(diffCodes(["a", "b", "c"], ["b", "d", "c"])).toEqual({
      added: ["d"],
      removed: ["a"],
    });
  });

  it("tidak ada perubahan menghasilkan dua daftar kosong", () => {
    expect(diffCodes(["a"], ["a"])).toEqual({ added: [], removed: [] });
  });
});
