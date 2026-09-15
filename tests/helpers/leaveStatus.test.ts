import { describe, it, expect } from "@jest/globals";
import {
  allowedTransitions,
  canTransition,
  statusLabel,
  type LeaveStatus,
} from "../../src/helpers/leaveStatus.js";

const ALL_STATUSES: LeaveStatus[] = [
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
    for (const target of ALL_STATUSES) {
      expect(canTransition("rejected", target)).toBe(false);
    }
  });

  it("cancelled adalah status akhir", () => {
    for (const target of ALL_STATUSES) {
      expect(canTransition("cancelled", target)).toBe(false);
    }
  });

  it("tidak ada status yang boleh berpindah ke dirinya sendiri", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("tidak ada status yang boleh kembali ke pending", () => {
    for (const status of ALL_STATUSES) {
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
    const transitions = allowedTransitions("pending");
    transitions.push("pending");

    expect(allowedTransitions("pending")).toHaveLength(3);
  });
});

describe("statusLabel", () => {
  it("memberi label bahasa Indonesia untuk setiap status", () => {
    expect(statusLabel("pending")).toBe("pending approval");
    expect(statusLabel("approved")).toBe("approved");
    expect(statusLabel("rejected")).toBe("rejected");
    expect(statusLabel("cancelled")).toBe("cancelled");
  });
});
