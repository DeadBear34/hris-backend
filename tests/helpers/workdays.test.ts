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

// 2026-01-05 adalah hari Senin, dipakai sebagai patokan seluruh pengujian
const SENIN = "2026-01-05";
const JUMAT = "2026-01-09";
const SABTU = "2026-01-10";
const MINGGU = "2026-01-11";
const SENIN_BERIKUTNYA = "2026-01-12";

describe("parseIsoDate dan toIsoDate", () => {
  it("membaca tanggal sebagai tanggal kalender UTC", () => {
    const tanggal = parseIsoDate(SENIN);

    expect(tanggal.getUTCFullYear()).toBe(2026);
    expect(tanggal.getUTCMonth()).toBe(0);
    expect(tanggal.getUTCDate()).toBe(5);
  });

  it("bolak-balik tanpa kehilangan nilai", () => {
    expect(toIsoDate(parseIsoDate(SENIN))).toBe(SENIN);
  });

  it("menolak tanggal yang tidak dapat dibaca", () => {
    expect(() => parseIsoDate("bukan-tanggal")).toThrow("Tanggal tidak valid");
  });
});

describe("isWeekend", () => {
  it("mengenali Sabtu", () => {
    expect(isWeekend(parseIsoDate(SABTU))).toBe(true);
  });

  it("mengenali Minggu", () => {
    expect(isWeekend(parseIsoDate(MINGGU))).toBe(true);
  });

  it("hari kerja bukan akhir pekan", () => {
    expect(isWeekend(parseIsoDate(SENIN))).toBe(false);
    expect(isWeekend(parseIsoDate(JUMAT))).toBe(false);
  });
});

describe("eachDateInRange", () => {
  it("menyertakan tanggal awal dan akhir", () => {
    const rentang = eachDateInRange(SENIN, JUMAT).map(toIsoDate);

    expect(rentang).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("rentang satu hari menghasilkan satu tanggal", () => {
    expect(eachDateInRange(SENIN, SENIN)).toHaveLength(1);
  });

  it("menghasilkan daftar kosong jika akhir mendahului awal", () => {
    expect(eachDateInRange(JUMAT, SENIN)).toEqual([]);
  });
});

describe("countWorkdays", () => {
  it("menghitung satu minggu kerja penuh sebagai lima hari", () => {
    expect(countWorkdays(SENIN, JUMAT)).toBe(5);
  });

  it("mengabaikan akhir pekan di tengah rentang", () => {
    // Jumat sampai Senin bernilai dua hari kerja, bukan empat
    expect(countWorkdays(JUMAT, SENIN_BERIKUTNYA)).toBe(2);
  });

  it("rentang yang seluruhnya akhir pekan bernilai nol", () => {
    expect(countWorkdays(SABTU, MINGGU)).toBe(0);
  });

  it("mengurangi hari libur yang jatuh pada hari kerja", () => {
    expect(countWorkdays(SENIN, JUMAT, ["2026-01-07"])).toBe(4);
  });

  it("mengurangi beberapa hari libur sekaligus", () => {
    expect(
      countWorkdays(SENIN, JUMAT, ["2026-01-06", "2026-01-07", "2026-01-08"]),
    ).toBe(2);
  });

  it("tidak menghitung ganda hari libur yang jatuh pada akhir pekan", () => {
    expect(countWorkdays(JUMAT, SENIN_BERIKUTNYA, [SABTU, MINGGU])).toBe(2);
  });

  it("hari libur di luar rentang tidak berpengaruh", () => {
    expect(countWorkdays(SENIN, JUMAT, ["2026-02-17"])).toBe(5);
  });

  it("seluruh hari kerja libur menghasilkan nol", () => {
    expect(
      countWorkdays(SENIN, JUMAT, [
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
        "2026-01-09",
      ]),
    ).toBe(0);
  });

  it("satu hari kerja tunggal bernilai satu", () => {
    expect(countWorkdays(SENIN, SENIN)).toBe(1);
  });

  it("menangani rentang yang melewati pergantian bulan", () => {
    // 2026-01-29 Kamis sampai 2026-02-03 Selasa
    expect(countWorkdays("2026-01-29", "2026-02-03")).toBe(4);
  });
});

describe("daysFromToday dan isPastDate", () => {
  function geser(hari: number): string {
    const tanggal = new Date();
    tanggal.setUTCDate(tanggal.getUTCDate() + hari);

    return toIsoDate(tanggal);
  }

  it("hari ini berjarak nol hari", () => {
    expect(daysFromToday(geser(0))).toBe(0);
  });

  it("menghitung jarak ke depan", () => {
    expect(daysFromToday(geser(7))).toBe(7);
  });

  it("menghitung jarak ke belakang sebagai negatif", () => {
    expect(daysFromToday(geser(-3))).toBe(-3);
  });

  it("tanggal kemarin dianggap sudah lewat", () => {
    expect(isPastDate(geser(-1))).toBe(true);
  });

  it("hari ini belum dianggap lewat", () => {
    expect(isPastDate(geser(0))).toBe(false);
  });

  it("tanggal besok belum lewat", () => {
    expect(isPastDate(geser(1))).toBe(false);
  });
});
