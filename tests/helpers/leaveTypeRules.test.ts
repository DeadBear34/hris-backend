import { describe, it, expect } from "@jest/globals";
import { ZodError } from "zod";
import {
  leaveTypeLimitIssues,
  assertLeaveTypeLimits,
} from "../../src/helpers/leaveTypeRules.js";

describe("aturan antarkolom jenis cuti", () => {
  it("konfigurasi yang wajar tidak menghasilkan masalah", () => {
    expect(
      leaveTypeLimitIssues({
        default_quota: 12,
        deducts_balance: true,
        requires_attachment: false,
        attachment_required_after: 0,
        max_days_per_request: 12,
      }),
    ).toEqual([]);
  });

  it("ambang lampiran harus di bawah batas per pengajuan", () => {
    const issues = leaveTypeLimitIssues({
      requires_attachment: true,
      attachment_required_after: 10000000,
      max_days_per_request: 300,
    });

    expect(issues.map((issue) => issue.field)).toEqual([
      "attachment_required_after",
    ]);
  });

  it("ambang yang sama dengan batas per pengajuan juga ditolak", () => {
    expect(
      leaveTypeLimitIssues({
        requires_attachment: true,
        attachment_required_after: 14,
        max_days_per_request: 14,
      }),
    ).toHaveLength(1);
  });

  it("ambang lampiran diabaikan bila lampiran tidak diwajibkan", () => {
    expect(
      leaveTypeLimitIssues({
        requires_attachment: false,
        attachment_required_after: 30,
        max_days_per_request: 14,
      }),
    ).toEqual([]);
  });

  it("tanpa batas per pengajuan, ambang berapa pun masih bisa tercapai", () => {
    expect(
      leaveTypeLimitIssues({
        requires_attachment: true,
        attachment_required_after: 30,
        max_days_per_request: null,
      }),
    ).toEqual([]);
  });

  it("batas per pengajuan tidak boleh melebihi jatah cuti yang memotong saldo", () => {
    const issues = leaveTypeLimitIssues({
      default_quota: 12,
      max_days_per_request: 20,
    });

    expect(issues.map((issue) => issue.field)).toEqual([
      "max_days_per_request",
    ]);
  });

  it("cuti yang tidak memotong saldo boleh melebihi angka jatahnya", () => {
    expect(
      leaveTypeLimitIssues({
        default_quota: 12,
        deducts_balance: false,
        max_days_per_request: 20,
      }),
    ).toEqual([]);
  });

  it("dilempar sebagai kegagalan validasi biasa", () => {
    expect(() =>
      assertLeaveTypeLimits({ default_quota: 5, max_days_per_request: 6 }),
    ).toThrow(ZodError);
    expect(() =>
      assertLeaveTypeLimits({ default_quota: 5, max_days_per_request: 5 }),
    ).not.toThrow();
  });
});
