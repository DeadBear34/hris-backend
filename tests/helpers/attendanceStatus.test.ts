import { describe, it, expect } from "@jest/globals";
import {
  statusLabel,
  butuhJamMasuk,
  jamMenit,
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
