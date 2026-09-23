import { describe, it, expect } from "@jest/globals";
import {
  countWorkdays,
  daysFromToday,
  eachDateInRange,
  isPastDate,
  isWeekend,
  parseIsoDate,
  toIsoDate,
} from "../../src/helpers/workdays.js";

const MONDAY = "2026-01-05";
const FRIDAY = "2026-01-09";
const SATURDAY = "2026-01-10";
const SUNDAY = "2026-01-11";
const NEXT_MONDAY = "2026-01-12";

describe("parseIsoDate dan toIsoDate", () => {
  it("membaca tanggal sebagai tanggal kalender UTC", () => {
    const date = parseIsoDate(MONDAY);

    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(5);
  });

  it("bolak-balik tanpa kehilangan nilai", () => {
    expect(toIsoDate(parseIsoDate(MONDAY))).toBe(MONDAY);
  });

  it("menolak tanggal yang tidak dapat dibaca", () => {
    expect(() => parseIsoDate("bukan-tanggal")).toThrow("Invalid date");
  });
});

describe("isWeekend", () => {
  it("mengenali Sabtu", () => {
    expect(isWeekend(parseIsoDate(SATURDAY))).toBe(true);
  });

  it("mengenali Minggu", () => {
    expect(isWeekend(parseIsoDate(SUNDAY))).toBe(true);
  });

  it("hari kerja bukan akhir pekan", () => {
    expect(isWeekend(parseIsoDate(MONDAY))).toBe(false);
    expect(isWeekend(parseIsoDate(FRIDAY))).toBe(false);
  });
});

describe("eachDateInRange", () => {
  it("menyertakan tanggal awal dan akhir", () => {
    const range = eachDateInRange(MONDAY, FRIDAY).map(toIsoDate);

    expect(range).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("rentang satu hari menghasilkan satu tanggal", () => {
    expect(eachDateInRange(MONDAY, MONDAY)).toHaveLength(1);
  });

  it("menghasilkan daftar kosong jika akhir mendahului awal", () => {
    expect(eachDateInRange(FRIDAY, MONDAY)).toEqual([]);
  });
});

describe("countWorkdays", () => {
  it("menghitung satu minggu kerja penuh sebagai lima hari", () => {
    expect(countWorkdays(MONDAY, FRIDAY)).toBe(5);
  });

  it("mengabaikan akhir pekan di tengah rentang", () => {
    // Jumat sampai Senin bernilai dua hari kerja, bukan empat
    expect(countWorkdays(FRIDAY, NEXT_MONDAY)).toBe(2);
  });

  it("rentang yang seluruhnya akhir pekan bernilai nol", () => {
    expect(countWorkdays(SATURDAY, SUNDAY)).toBe(0);
  });

  it("mengurangi hari libur yang jatuh pada hari kerja", () => {
    expect(countWorkdays(MONDAY, FRIDAY, ["2026-01-07"])).toBe(4);
  });

  it("mengurangi beberapa hari libur sekaligus", () => {
    expect(
      countWorkdays(MONDAY, FRIDAY, ["2026-01-06", "2026-01-07", "2026-01-08"]),
    ).toBe(2);
  });

  it("tidak menghitung ganda hari libur yang jatuh pada akhir pekan", () => {
    expect(countWorkdays(FRIDAY, NEXT_MONDAY, [SATURDAY, SUNDAY])).toBe(2);
  });

  it("hari libur di luar rentang tidak berpengaruh", () => {
    expect(countWorkdays(MONDAY, FRIDAY, ["2026-02-17"])).toBe(5);
  });

  it("seluruh hari kerja libur menghasilkan nol", () => {
    expect(
      countWorkdays(MONDAY, FRIDAY, [
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
        "2026-01-09",
      ]),
    ).toBe(0);
  });

  it("satu hari kerja tunggal bernilai satu", () => {
    expect(countWorkdays(MONDAY, MONDAY)).toBe(1);
  });

  it("menangani rentang yang melewati pergantian bulan", () => {
    // 2026-01-29 Kamis sampai 2026-02-03 Selasa
    expect(countWorkdays("2026-01-29", "2026-02-03")).toBe(4);
  });
});

describe("daysFromToday dan isPastDate", () => {
  function shiftDays(day: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + day);

    return toIsoDate(date);
  }

  it("hari ini berjarak nol hari", () => {
    expect(daysFromToday(shiftDays(0))).toBe(0);
  });

  it("menghitung jarak ke depan", () => {
    expect(daysFromToday(shiftDays(7))).toBe(7);
  });

  it("menghitung jarak ke belakang sebagai negatif", () => {
    expect(daysFromToday(shiftDays(-3))).toBe(-3);
  });

  it("tanggal kemarin dianggap sudah lewat", () => {
    expect(isPastDate(shiftDays(-1))).toBe(true);
  });

  it("hari ini belum dianggap lewat", () => {
    expect(isPastDate(shiftDays(0))).toBe(false);
  });

  it("tanggal besok belum lewat", () => {
    expect(isPastDate(shiftDays(1))).toBe(false);
  });
});
