import { describe, it, expect } from "@jest/globals";
import {
  allowedTransitions,
  canTransition,
  statusLabel,
  type LeaveStatus,
} from "../../src/helpers/leaveStatus.js";

const SEMUA_STATUS: LeaveStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

describe("transisi yang diizinkan", () => {
  it("pending dapat disetujui", () => {
    expect(canTransition("pending", "approved")).toBe(true);
  });

  it("pending dapat ditolak", () => {
    expect(canTransition("pending", "rejected")).toBe(true);
  });

  it("pending dapat dibatalkan", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
  });

  it("approved dapat dibatalkan", () => {
    expect(canTransition("approved", "cancelled")).toBe(true);
  });
});

describe("transisi yang ditolak", () => {
  it("approved tidak dapat disetujui ulang", () => {
    expect(canTransition("approved", "approved")).toBe(false);
  });

  it("approved tidak dapat ditolak", () => {
    expect(canTransition("approved", "rejected")).toBe(false);
  });

  it("rejected adalah status akhir", () => {
    for (const tujuan of SEMUA_STATUS) {
      expect(canTransition("rejected", tujuan)).toBe(false);
    }
  });

  it("cancelled adalah status akhir", () => {
    for (const tujuan of SEMUA_STATUS) {
      expect(canTransition("cancelled", tujuan)).toBe(false);
    }
  });

  it("tidak ada status yang boleh berpindah ke dirinya sendiri", () => {
    for (const status of SEMUA_STATUS) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("tidak ada status yang boleh kembali ke pending", () => {
    for (const status of SEMUA_STATUS) {
      expect(canTransition(status, "pending")).toBe(false);
    }
  });
});

describe("allowedTransitions", () => {
  it("menyebutkan seluruh tujuan dari pending", () => {
    expect(allowedTransitions("pending").sort()).toEqual([
      "approved",
      "cancelled",
      "rejected",
    ]);
  });

  it("approved hanya menuju cancelled", () => {
    expect(allowedTransitions("approved")).toEqual(["cancelled"]);
  });

  it("status akhir tidak punya tujuan", () => {
    expect(allowedTransitions("rejected")).toEqual([]);
    expect(allowedTransitions("cancelled")).toEqual([]);
  });

  it("mengembalikan salinan sehingga aturan tidak dapat diubah dari luar", () => {
    const daftar = allowedTransitions("pending");
    daftar.push("pending");

    expect(allowedTransitions("pending")).toHaveLength(3);
  });
});

describe("statusLabel", () => {
  it("memberi label bahasa Indonesia untuk setiap status", () => {
    expect(statusLabel("pending")).toBe("menunggu persetujuan");
    expect(statusLabel("approved")).toBe("disetujui");
    expect(statusLabel("rejected")).toBe("ditolak");
    expect(statusLabel("cancelled")).toBe("dibatalkan");
  });
});
