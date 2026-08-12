import { describe, it, expect } from "@jest/globals";
import {
  listHolidayQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
} from "../../src/schema/holidaySchema.js";
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
} from "../../src/schema/leaveTypeSchema.js";
import {
  listLeaveRequestQuerySchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
} from "../../src/schema/leaveRequestSchema.js";
import {
  balanceQuerySchema,
  listLedgerQuerySchema,
  adjustBalanceSchema,
} from "../../src/schema/leaveBalanceSchema.js";

const UUID = "44444444-4444-4444-8444-444444444444";

describe("listHolidayQuerySchema", () => {
  it("memberi halaman dan batas bawaan", () => {
    const result = listHolidayQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    }
  });

  it("mengubah tahun dari string menjadi angka", () => {
    const result = listHolidayQuerySchema.safeParse({ year: "2026" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.year).toBe(2026);
  });

  it("menolak tahun di luar rentang wajar", () => {
    expect(listHolidayQuerySchema.safeParse({ year: "1500" }).success).toBe(
      false,
    );
  });

  it("menolak batas melebihi 100", () => {
    expect(listHolidayQuerySchema.safeParse({ limit: "500" }).success).toBe(
      false,
    );
  });
});

describe("createHolidaySchema", () => {
  const valid = { holiday_date: "2026-08-17", name: "Hari Kemerdekaan" };

  it("menerima data yang valid", () => {
    expect(createHolidaySchema.safeParse(valid).success).toBe(true);
  });

  it("menolak format tanggal selain YYYY-MM-DD", () => {
    const result = createHolidaySchema.safeParse({
      ...valid,
      holiday_date: "17-08-2026",
    });

    expect(result.success).toBe(false);
  });

  it("menolak tanggal yang tidak ada di kalender", () => {
    const result = createHolidaySchema.safeParse({
      ...valid,
      holiday_date: "2026-02-30",
    });

    expect(result.success).toBe(false);
  });

  it("menolak nama yang terlalu pendek", () => {
    expect(
      createHolidaySchema.safeParse({ ...valid, name: "HK" }).success,
    ).toBe(false);
  });

  it("membuang spasi di sekitar nama", () => {
    const result = createHolidaySchema.safeParse({
      ...valid,
      name: "  Hari Kemerdekaan  ",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Hari Kemerdekaan");
  });

  it("menerima penanda cuti bersama", () => {
    const result = createHolidaySchema.safeParse({
      ...valid,
      is_collective_leave: true,
    });

    expect(result.success).toBe(true);
  });

  it("pembaruan menerima objek kosong", () => {
    expect(updateHolidaySchema.safeParse({}).success).toBe(true);
  });
});

describe("createLeaveTypeSchema", () => {
  const valid = { code: "ANNUAL", name: "Cuti Tahunan" };

  it("menerima data minimum", () => {
    expect(createLeaveTypeSchema.safeParse(valid).success).toBe(true);
  });

  it("mengubah kode menjadi huruf besar", () => {
    const result = createLeaveTypeSchema.safeParse({
      ...valid,
      code: "annual",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("ANNUAL");
  });

  it("menerima jatah bernilai null untuk cuti tanpa kuota", () => {
    const result = createLeaveTypeSchema.safeParse({
      ...valid,
      default_quota: null,
    });

    expect(result.success).toBe(true);
  });

  it("menolak jatah negatif", () => {
    expect(
      createLeaveTypeSchema.safeParse({ ...valid, default_quota: -1 }).success,
    ).toBe(false);
  });

  it("menerima batasan gender", () => {
    const result = createLeaveTypeSchema.safeParse({
      ...valid,
      gender_restriction: "female",
    });

    expect(result.success).toBe(true);
  });

  it("menolak batasan gender di luar pilihan", () => {
    expect(
      createLeaveTypeSchema.safeParse({
        ...valid,
        gender_restriction: "lainnya",
      }).success,
    ).toBe(false);
  });

  it("menolak ambang lampiran nol", () => {
    expect(
      createLeaveTypeSchema.safeParse({
        ...valid,
        attachment_required_after: 0,
      }).success,
    ).toBe(false);
  });

  it("menolak minimal pemberitahuan negatif", () => {
    expect(
      createLeaveTypeSchema.safeParse({ ...valid, min_notice_days: -1 })
        .success,
    ).toBe(false);
  });

  it("pembaruan menerima is_active", () => {
    const result = updateLeaveTypeSchema.safeParse({ is_active: false });

    expect(result.success).toBe(true);
  });

  it("pembuatan tidak menerima is_active", () => {
    const result = createLeaveTypeSchema.safeParse({
      ...valid,
      is_active: false,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("is_active");
  });
});

describe("createLeaveRequestSchema", () => {
  const valid = {
    leave_type_id: UUID,
    start_date: "2026-03-02",
    end_date: "2026-03-04",
  };

  it("menerima data yang valid", () => {
    expect(createLeaveRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("menerima rentang satu hari", () => {
    const result = createLeaveRequestSchema.safeParse({
      ...valid,
      end_date: valid.start_date,
    });

    expect(result.success).toBe(true);
  });

  it("menolak tanggal selesai yang mendahului tanggal mulai", () => {
    const result = createLeaveRequestSchema.safeParse({
      ...valid,
      start_date: "2026-03-10",
      end_date: "2026-03-05",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("end_date");
    }
  });

  it("menolak jenis cuti yang bukan uuid", () => {
    expect(
      createLeaveRequestSchema.safeParse({ ...valid, leave_type_id: "1" })
        .success,
    ).toBe(false);
  });

  it("menolak alasan melebihi 500 karakter", () => {
    expect(
      createLeaveRequestSchema.safeParse({ ...valid, reason: "a".repeat(501) })
        .success,
    ).toBe(false);
  });

  it("catatan keputusan bersifat opsional", () => {
    expect(decideLeaveRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("listLeaveRequestQuerySchema", () => {
  it("memberi nilai bawaan paginasi", () => {
    const result = listLeaveRequestQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    }
  });

  it("menerima seluruh status yang sah", () => {
    for (const status of ["pending", "approved", "rejected", "cancelled"]) {
      expect(listLeaveRequestQuerySchema.safeParse({ status }).success).toBe(
        true,
      );
    }
  });

  it("menolak status di luar pilihan", () => {
    expect(
      listLeaveRequestQuerySchema.safeParse({ status: "menunggu" }).success,
    ).toBe(false);
  });

  it("menolak rentang tanggal yang terbalik", () => {
    const result = listLeaveRequestQuerySchema.safeParse({
      start_date: "2026-05-10",
      end_date: "2026-05-01",
    });

    expect(result.success).toBe(false);
  });

  it("menerima satu sisi rentang saja", () => {
    expect(
      listLeaveRequestQuerySchema.safeParse({ start_date: "2026-05-10" })
        .success,
    ).toBe(true);
  });
});

describe("skema saldo cuti", () => {
  it("periode bersifat opsional pada query saldo", () => {
    expect(balanceQuerySchema.safeParse({}).success).toBe(true);
  });

  it("menolak periode di luar rentang", () => {
    expect(balanceQuerySchema.safeParse({ period_year: 1999 }).success).toBe(
      false,
    );
  });

  it("ledger memberi nilai bawaan paginasi", () => {
    const result = listLedgerQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(10);
  });

  it("penyesuaian menerima nilai negatif", () => {
    const result = adjustBalanceSchema.safeParse({
      employee_id: UUID,
      leave_type_id: UUID,
      period_year: 2026,
      amount: -2,
      note: "Koreksi kelebihan jatah",
    });

    expect(result.success).toBe(true);
  });

  it("penyesuaian menolak nilai nol", () => {
    const result = adjustBalanceSchema.safeParse({
      employee_id: UUID,
      leave_type_id: UUID,
      period_year: 2026,
      amount: 0,
      note: "Tidak berarti",
    });

    expect(result.success).toBe(false);
  });

  it("penyesuaian mewajibkan alasan", () => {
    const result = adjustBalanceSchema.safeParse({
      employee_id: UUID,
      leave_type_id: UUID,
      period_year: 2026,
      amount: 3,
    });

    expect(result.success).toBe(false);
  });

  it("penyesuaian menolak alasan yang terlalu pendek", () => {
    const result = adjustBalanceSchema.safeParse({
      employee_id: UUID,
      leave_type_id: UUID,
      period_year: 2026,
      amount: 3,
      note: "ok",
    });

    expect(result.success).toBe(false);
  });
});
