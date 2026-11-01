import { describe, it, expect } from "@jest/globals";
import {
  overtimeMinutes,
  isBeforeShiftStart,
} from "../../src/helpers/overtime.js";
import { instantOf } from "../../src/helpers/timezone.js";

const schedule = {
  start_time: "08:00:00",
  end_time: "17:00:00",
  overtime_min_minutes: 30,
};

const at = (iso: string) => new Date(iso);

describe("saat dari tanggal dan jam kantor", () => {
  it("17:00 WIB sama dengan 10:00 UTC", () => {
    expect(instantOf("2026-03-10", "17:00").toISOString()).toBe(
      "2026-03-10T10:00:00.000Z",
    );
  });

  it("menerima format jam dengan detik", () => {
    expect(instantOf("2026-03-10", "17:00:00").toISOString()).toBe(
      "2026-03-10T10:00:00.000Z",
    );
  });

  it("jam dini hari WIB jatuh di tanggal UTC sebelumnya", () => {
    expect(instantOf("2026-03-10", "02:00").toISOString()).toBe(
      "2026-03-09T19:00:00.000Z",
    );
  });
});

describe("menit lembur", () => {
  it("dihitung sejak jam pulang jadwal", () => {
    expect(
      overtimeMinutes("2026-03-10", at("2026-03-10T19:15:00+07:00"), schedule),
    ).toBe(135);
  });

  it("nol bila pulang sebelum atau tepat jam pulang", () => {
    expect(
      overtimeMinutes("2026-03-10", at("2026-03-10T16:00:00+07:00"), schedule),
    ).toBe(0);
    expect(
      overtimeMinutes("2026-03-10", at("2026-03-10T17:00:00+07:00"), schedule),
    ).toBe(0);
  });

  it("nol bila di bawah batas minimal", () => {
    expect(
      overtimeMinutes("2026-03-10", at("2026-03-10T17:29:00+07:00"), schedule),
    ).toBe(0);
  });

  it("dihitung penuh begitu mencapai batas minimal", () => {
    expect(
      overtimeMinutes("2026-03-10", at("2026-03-10T17:30:00+07:00"), schedule),
    ).toBe(30);
  });

  it("berlanjut lewat tengah malam dihitung dari jam pulang hari absensinya", () => {
    expect(
      overtimeMinutes("2026-03-10", at("2026-03-11T01:00:00+07:00"), schedule),
    ).toBe(480);
  });
});

describe("sebelum jam kerja dimulai", () => {
  it("benar sebelum jam masuk dan salah sejak jam masuk", () => {
    expect(isBeforeShiftStart(7 * 60 + 59, schedule)).toBe(true);
    expect(isBeforeShiftStart(8 * 60, schedule)).toBe(false);
  });
});
