import { describe, it, expect } from "@jest/globals";
import {
  keWaktuLokal,
  tanggalHariIni,
  jamLokal,
  menitDariJam,
  namaHariDariTanggal,
  menitKeterlambatan,
  selisihMenit,
  rentangTanggal,
} from "../../src/helpers/timezone.js";

// Seluruh pengujian memakai waktu yang disuntikkan, tidak pernah waktu sistem,
// supaya hasilnya sama kapan pun test dijalankan.

describe("keWaktuLokal", () => {
  it("menggeser UTC ke WIB dengan benar", () => {
    // 2026-03-10 01:00 UTC = 2026-03-10 08:00 WIB
    const lokal = keWaktuLokal(new Date("2026-03-10T01:00:00Z"));

    expect(lokal.tanggal).toBe("2026-03-10");
    expect(lokal.jam).toBe(8);
    expect(lokal.menit).toBe(0);
    expect(lokal.menitSejakTengahMalam).toBe(480);
  });

  it("check-in dini hari tetap tercatat pada tanggal WIB yang benar", () => {
    // 2026-03-09 23:00 UTC sudah masuk 2026-03-10 06:00 WIB.
    // Kalau diambil dari UTC, tanggalnya keliru menjadi 09 dan aturan
    // satu kali check-in per hari bocor.
    const lokal = keWaktuLokal(new Date("2026-03-09T23:00:00Z"));

    expect(lokal.tanggal).toBe("2026-03-10");
    expect(lokal.jam).toBe(6);
  });

  it("check-in pukul 08:00 pada hari yang sama menghasilkan tanggal sama", () => {
    const dini = keWaktuLokal(new Date("2026-03-09T23:00:00Z"));
    const pagi = keWaktuLokal(new Date("2026-03-10T01:00:00Z"));

    expect(dini.tanggal).toBe(pagi.tanggal);
  });

  it("tepat tengah malam WIB masuk ke tanggal baru", () => {
    // 2026-03-09 17:00 UTC = 2026-03-10 00:00 WIB
    const lokal = keWaktuLokal(new Date("2026-03-09T17:00:00Z"));

    expect(lokal.tanggal).toBe("2026-03-10");
    expect(lokal.jam).toBe(0);
    expect(lokal.menitSejakTengahMalam).toBe(0);
  });

  it("satu menit sebelum tengah malam WIB masih tanggal lama", () => {
    const lokal = keWaktuLokal(new Date("2026-03-09T16:59:00Z"));

    expect(lokal.tanggal).toBe("2026-03-09");
    expect(lokal.jam).toBe(23);
    expect(lokal.menit).toBe(59);
  });

  it("menentukan hari dalam seminggu menurut waktu lokal", () => {
    // 2026-03-10 WIB adalah hari Selasa
    expect(keWaktuLokal(new Date("2026-03-10T01:00:00Z")).hari).toBe(2);
  });

  it("hari ikut bergeser saat tanggal lokal berbeda dari UTC", () => {
    // 2026-03-08 UTC malam sudah menjadi Senin 2026-03-09 WIB
    const lokal = keWaktuLokal(new Date("2026-03-08T17:30:00Z"));

    expect(lokal.tanggal).toBe("2026-03-09");
    expect(lokal.hari).toBe(1);
  });

  it("melewati pergantian bulan dengan benar", () => {
    const lokal = keWaktuLokal(new Date("2026-01-31T18:00:00Z"));

    expect(lokal.tanggal).toBe("2026-02-01");
  });

  it("melewati pergantian tahun dengan benar", () => {
    const lokal = keWaktuLokal(new Date("2026-12-31T20:00:00Z"));

    expect(lokal.tanggal).toBe("2027-01-01");
  });
});

describe("tanggalHariIni", () => {
  it("mengambil tanggal lokal dari waktu yang diberikan", () => {
    expect(tanggalHariIni(new Date("2026-03-09T23:00:00Z"))).toBe("2026-03-10");
  });

  it("berformat YYYY-MM-DD", () => {
    expect(tanggalHariIni(new Date("2026-03-10T01:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("jamLokal", () => {
  it("memberi jam dinding lokal berformat HH:MM", () => {
    expect(jamLokal(new Date("2026-03-10T01:05:00Z"))).toBe("08:05");
  });

  it("menambahkan angka nol di depan", () => {
    expect(jamLokal(new Date("2026-03-09T22:03:00Z"))).toBe("05:03");
  });
});

describe("menitDariJam", () => {
  it("membaca kolom time berformat HH:MM:SS dari driver pg", () => {
    expect(menitDariJam("08:00:00")).toBe(480);
  });

  it("membaca format HH:MM tanpa detik", () => {
    expect(menitDariJam("17:30")).toBe(1050);
  });

  it("tengah malam bernilai nol", () => {
    expect(menitDariJam("00:00:00")).toBe(0);
  });

  it("menolak format yang tidak dapat dibaca", () => {
    expect(() => menitDariJam("delapan pagi")).toThrow(
      "Format jam tidak valid",
    );
  });
});

describe("namaHariDariTanggal", () => {
  it("memetakan tanggal ke nama kolom hari kerja", () => {
    expect(namaHariDariTanggal("2026-03-09")).toBe("monday");
    expect(namaHariDariTanggal("2026-03-14")).toBe("saturday");
    expect(namaHariDariTanggal("2026-03-15")).toBe("sunday");
  });

  it("menolak tanggal yang tidak dapat dibaca", () => {
    expect(() => namaHariDariTanggal("bukan-tanggal")).toThrow(
      "Tanggal tidak valid",
    );
  });
});

describe("menitKeterlambatan", () => {
  it("menghitung selisih terhadap jam masuk", () => {
    // datang 08:20 dengan jam masuk 08:00
    expect(menitKeterlambatan(500, 480)).toBe(20);
  });

  it("datang tepat waktu bernilai nol", () => {
    expect(menitKeterlambatan(480, 480)).toBe(0);
  });

  it("datang lebih awal tetap nol, bukan negatif", () => {
    expect(menitKeterlambatan(450, 480)).toBe(0);
  });
});

describe("selisihMenit", () => {
  it("menghitung durasi kerja antara dua timestamp", () => {
    const masuk = new Date("2026-03-10T01:00:00Z");
    const pulang = new Date("2026-03-10T10:00:00Z");

    expect(selisihMenit(masuk, pulang)).toBe(540);
  });

  it("membulatkan ke bawah untuk detik yang tersisa", () => {
    const masuk = new Date("2026-03-10T01:00:00Z");
    const pulang = new Date("2026-03-10T01:01:59Z");

    expect(selisihMenit(masuk, pulang)).toBe(1);
  });
});

describe("rentangTanggal", () => {
  it("menyertakan tanggal awal dan akhir", () => {
    expect(rentangTanggal("2026-03-09", "2026-03-11")).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
    ]);
  });

  it("rentang satu hari menghasilkan satu tanggal", () => {
    expect(rentangTanggal("2026-03-09", "2026-03-09")).toEqual(["2026-03-09"]);
  });

  it("melewati pergantian bulan", () => {
    expect(rentangTanggal("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });

  it("menghasilkan daftar kosong bila akhir mendahului awal", () => {
    expect(rentangTanggal("2026-03-11", "2026-03-09")).toEqual([]);
  });
});
