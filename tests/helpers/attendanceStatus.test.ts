import { describe, it, expect } from "@jest/globals";
import {
  statusLabel,
  butuhJamMasuk,
  jamMenit,
  tentukanStatusKedatangan,
  tentukanPenandaHarian,
} from "../../src/helpers/attendanceStatus.js";

describe("statusLabel", () => {
  it("menerjemahkan setiap status ke bahasa Indonesia", () => {
    expect(statusLabel("present")).toBe("hadir");
    expect(statusLabel("late")).toBe("terlambat");
    expect(statusLabel("absent")).toBe("tidak hadir");
    expect(statusLabel("leave")).toBe("cuti");
    expect(statusLabel("holiday")).toBe("libur");
  });
});

describe("butuhJamMasuk", () => {
  it("hanya hadir dan terlambat yang mengharuskan jam masuk", () => {
    expect(butuhJamMasuk("present")).toBe(true);
    expect(butuhJamMasuk("late")).toBe(true);
  });

  it("status tanpa kehadiran justru tidak boleh memiliki jam masuk", () => {
    expect(butuhJamMasuk("absent")).toBe(false);
    expect(butuhJamMasuk("leave")).toBe(false);
    expect(butuhJamMasuk("holiday")).toBe(false);
  });
});

describe("jamMenit", () => {
  it("menampilkan jam dan menit sekaligus", () => {
    expect(jamMenit(510)).toBe("8 jam 30 menit");
  });

  it("menghilangkan menit ketika pas pada jam bulat", () => {
    expect(jamMenit(540)).toBe("9 jam");
  });

  it("menampilkan menit saja untuk durasi di bawah satu jam", () => {
    expect(jamMenit(45)).toBe("45 menit");
  });

  it("durasi nol tetap terbaca", () => {
    expect(jamMenit(0)).toBe("0 menit");
  });
});

describe("tentukanStatusKedatangan", () => {
  const MASUK = 8 * 60;
  const TOLERANSI = 5;
  const TUTUP = 8 * 60 + 10;

  const putuskan = (jam: number, menit: number) =>
    tentukanStatusKedatangan(jam * 60 + menit, MASUK, TOLERANSI, TUTUP);

  it("datang sebelum jam masuk tetap hadir", () => {
    expect(putuskan(7, 30)).toBe("present");
  });

  it("tepat pada jam masuk hadir", () => {
    expect(putuskan(8, 0)).toBe("present");
  });

  it("tepat pada batas toleransi masih hadir", () => {
    expect(putuskan(8, 5)).toBe("present");
  });

  it("satu menit setelah toleransi menjadi terlambat", () => {
    expect(putuskan(8, 6)).toBe("late");
  });

  it("tepat pada batas absen masih terlambat", () => {
    expect(putuskan(8, 10)).toBe("late");
  });

  it("satu menit setelah batas absen ditolak", () => {
    expect(putuskan(8, 11)).toBe("ditolak");
  });

  it("datang jauh setelah batas absen ditolak", () => {
    expect(putuskan(14, 0)).toBe("ditolak");
  });

  it("tidak menyisakan menit tanpa keputusan sepanjang hari", () => {
    for (let menit = 0; menit < 1440; menit++) {
      const hasil = tentukanStatusKedatangan(menit, MASUK, TOLERANSI, TUTUP);

      expect(["present", "late", "ditolak"]).toContain(hasil);
    }
  });

  it("toleransi nol membuat satu menit terlambat langsung terhitung", () => {
    expect(tentukanStatusKedatangan(481, MASUK, 0, TUTUP)).toBe("late");
    expect(tentukanStatusKedatangan(480, MASUK, 0, TUTUP)).toBe("present");
  });
});

describe("tentukanPenandaHarian", () => {
  const keadaan = (
    ubah: Partial<Parameters<typeof tentukanPenandaHarian>[0]>,
  ) =>
    tentukanPenandaHarian({
      sudahAdaAbsensi: false,
      hariLibur: false,
      sedangCuti: false,
      hariKerja: true,
      ...ubah,
    });

  it("melewati karyawan yang sudah punya absensi", () => {
    expect(keadaan({ sudahAdaAbsensi: true })).toBe("lewati");
  });

  it("absensi yang sudah ada mengalahkan seluruh pertimbangan lain", () => {
    expect(
      keadaan({ sudahAdaAbsensi: true, hariLibur: true, sedangCuti: true }),
    ).toBe("lewati");
  });

  it("hari libur mengalahkan cuti", () => {
    expect(keadaan({ hariLibur: true, sedangCuti: true })).toBe("holiday");
  });

  it("cuti mengalahkan tidak hadir", () => {
    expect(keadaan({ sedangCuti: true })).toBe("leave");
  });

  it("hari kerja tanpa absensi menjadi tidak hadir", () => {
    expect(keadaan({})).toBe("absent");
  });

  it("bukan hari kerja tidak menghasilkan baris apa pun", () => {
    expect(keadaan({ hariKerja: false })).toBe("lewati");
  });

  it("hari libur tetap ditandai walau jatuh di luar hari kerja", () => {
    expect(keadaan({ hariLibur: true, hariKerja: false })).toBe("holiday");
  });

  it("cuti tetap ditandai walau jatuh di luar hari kerja", () => {
    expect(keadaan({ sedangCuti: true, hariKerja: false })).toBe("leave");
  });

  it("selalu memberi keputusan untuk setiap kombinasi keadaan", () => {
    const nilai = [false, true];

    for (const sudahAdaAbsensi of nilai)
      for (const hariLibur of nilai)
        for (const sedangCuti of nilai)
          for (const hariKerja of nilai) {
            const hasil = tentukanPenandaHarian({
              sudahAdaAbsensi,
              hariLibur,
              sedangCuti,
              hariKerja,
            });

            expect(["holiday", "leave", "absent", "lewati"]).toContain(hasil);
          }
  });
});
