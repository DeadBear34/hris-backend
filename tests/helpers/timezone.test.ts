import { describe, it, expect } from "@jest/globals";
import {
  toLocalTime,
  todayInOfficeZone,
  clockTimeOf,
  minutesFromClockTime,
  dayNameOf,
  lateMinutesFrom,
  minutesBetween,
  dateRange,
} from "../../src/helpers/timezone.js";

// Seluruh pengujian memakai waktu yang disuntikkan, tidak pernah waktu sistem,
// supaya hasilnya sama kapan pun test dijalankan.

describe("keWaktuLokal", () => {
  it("menggeser UTC ke WIB dengan benar", () => {
    // 2026-03-10 01:00 UTC = 2026-03-10 08:00 WIB
    const local = toLocalTime(new Date("2026-03-10T01:00:00Z"));

    expect(local.date).toBe("2026-03-10");
    expect(local.hour).toBe(8);
    expect(local.minute).toBe(0);
    expect(local.minutesSinceMidnight).toBe(480);
  });

  it("check-in dini hari tetap tercatat pada tanggal WIB yang benar", () => {
    // 2026-03-09 23:00 UTC sudah masuk 2026-03-10 06:00 WIB.
    // Kalau diambil dari UTC, tanggalnya keliru menjadi 09 dan aturan
    // satu kali check-in per hari bocor.
    const local = toLocalTime(new Date("2026-03-09T23:00:00Z"));

    expect(local.date).toBe("2026-03-10");
    expect(local.hour).toBe(6);
  });

  it("check-in pukul 08:00 pada hari yang sama menghasilkan tanggal sama", () => {
    const dini = toLocalTime(new Date("2026-03-09T23:00:00Z"));
    const pagi = toLocalTime(new Date("2026-03-10T01:00:00Z"));

    expect(dini.date).toBe(pagi.date);
  });

  it("tepat tengah malam WIB masuk ke tanggal baru", () => {
    // 2026-03-09 17:00 UTC = 2026-03-10 00:00 WIB
    const local = toLocalTime(new Date("2026-03-09T17:00:00Z"));

    expect(local.date).toBe("2026-03-10");
    expect(local.hour).toBe(0);
    expect(local.minutesSinceMidnight).toBe(0);
  });

  it("satu menit sebelum tengah malam WIB masih tanggal lama", () => {
    const local = toLocalTime(new Date("2026-03-09T16:59:00Z"));

    expect(local.date).toBe("2026-03-09");
    expect(local.hour).toBe(23);
    expect(local.minute).toBe(59);
  });

  it("menentukan hari dalam seminggu menurut waktu lokal", () => {
    // 2026-03-10 WIB adalah hari Selasa
    expect(toLocalTime(new Date("2026-03-10T01:00:00Z")).day).toBe(2);
  });

  it("hari ikut bergeser saat tanggal lokal berbeda dari UTC", () => {
    // 2026-03-08 UTC malam sudah menjadi Senin 2026-03-09 WIB
    const local = toLocalTime(new Date("2026-03-08T17:30:00Z"));

    expect(local.date).toBe("2026-03-09");
    expect(local.day).toBe(1);
  });

  it("melewati pergantian bulan dengan benar", () => {
    const local = toLocalTime(new Date("2026-01-31T18:00:00Z"));

    expect(local.date).toBe("2026-02-01");
  });

  it("melewati pergantian tahun dengan benar", () => {
    const local = toLocalTime(new Date("2026-12-31T20:00:00Z"));

    expect(local.date).toBe("2027-01-01");
  });
});

describe("tanggalHariIni", () => {
  it("mengambil tanggal lokal dari waktu yang diberikan", () => {
    expect(todayInOfficeZone(new Date("2026-03-09T23:00:00Z"))).toBe("2026-03-10");
  });

  it("berformat YYYY-MM-DD", () => {
    expect(todayInOfficeZone(new Date("2026-03-10T01:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("jamLokal", () => {
  it("memberi jam dinding lokal berformat HH:MM", () => {
    expect(clockTimeOf(new Date("2026-03-10T01:05:00Z"))).toBe("08:05");
  });

  it("menambahkan angka nol di depan", () => {
    expect(clockTimeOf(new Date("2026-03-09T22:03:00Z"))).toBe("05:03");
  });
});

describe("menitDariJam", () => {
  it("membaca kolom time berformat HH:MM:SS dari driver pg", () => {
    expect(minutesFromClockTime("08:00:00")).toBe(480);
  });

  it("membaca format HH:MM tanpa detik", () => {
    expect(minutesFromClockTime("17:30")).toBe(1050);
  });

  it("tengah malam bernilai nol", () => {
    expect(minutesFromClockTime("00:00:00")).toBe(0);
  });

  it("menolak format yang tidak dapat dibaca", () => {
    expect(() => minutesFromClockTime("delapan pagi")).toThrow(
      "Format jam tidak valid",
    );
  });
});

describe("namaHariDariTanggal", () => {
  it("memetakan tanggal ke nama kolom hari kerja", () => {
    expect(dayNameOf("2026-03-09")).toBe("monday");
    expect(dayNameOf("2026-03-14")).toBe("saturday");
    expect(dayNameOf("2026-03-15")).toBe("sunday");
  });

  it("menolak tanggal yang tidak dapat dibaca", () => {
    expect(() => dayNameOf("bukan-tanggal")).toThrow(
      "Tanggal tidak valid",
    );
  });
});

describe("menitKeterlambatan", () => {
  it("menghitung selisih terhadap jam masuk", () => {
    // datang 08:20 dengan jam masuk 08:00
    expect(lateMinutesFrom(500, 480)).toBe(20);
  });

  it("datang tepat waktu bernilai nol", () => {
    expect(lateMinutesFrom(480, 480)).toBe(0);
  });

  it("datang lebih awal tetap nol, bukan negatif", () => {
    expect(lateMinutesFrom(450, 480)).toBe(0);
  });
});

describe("selisihMenit", () => {
  it("menghitung durasi kerja antara dua timestamp", () => {
    const checkIn = new Date("2026-03-10T01:00:00Z");
    const checkOut = new Date("2026-03-10T10:00:00Z");

    expect(minutesBetween(checkIn, checkOut)).toBe(540);
  });

  it("membulatkan ke bawah untuk detik yang tersisa", () => {
    const checkIn = new Date("2026-03-10T01:00:00Z");
    const checkOut = new Date("2026-03-10T01:01:59Z");

    expect(minutesBetween(checkIn, checkOut)).toBe(1);
  });
});

describe("rentangTanggal", () => {
  it("menyertakan tanggal awal dan akhir", () => {
    expect(dateRange("2026-03-09", "2026-03-11")).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ]);
  });

  it("rentang satu hari menghasilkan satu tanggal", () => {
    expect(dateRange("2026-03-09", "2026-03-09")).toEqual(["2026-03-09"]);
  });

  it("melewati pergantian bulan", () => {
    expect(dateRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("menghasilkan daftar kosong bila akhir mendahului awal", () => {
    expect(dateRange("2026-03-11", "2026-03-09")).toEqual([]);
  });
});
