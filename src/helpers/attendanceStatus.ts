import type { AttendanceStatus } from "../models/attendance.js";

const LABEL: Record<AttendanceStatus, string> = {
  present: "hadir",
  late: "terlambat",
  absent: "tidak hadir",
  leave: "cuti",
  holiday: "libur",
};

export function statusLabel(status: AttendanceStatus): string {
  return LABEL[status];
}

export function butuhJamMasuk(status: AttendanceStatus): boolean {
  switch (status) {
    case "present":
    case "late":
      return true;

    case "absent":
    case "leave":
    case "holiday":
      return false;
  }
}

export function jamMenit(menit: number): string {
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;

  if (jam === 0) return `${sisa} menit`;
  if (sisa === 0) return `${jam} jam`;

  return `${jam} jam ${sisa} menit`;
}

export type HasilKedatangan = "present" | "late" | "ditolak";

export function tentukanStatusKedatangan(
  menitDatang: number,
  menitMasuk: number,
  toleransiMenit: number,
  menitTutup: number,
): HasilKedatangan {
  switch (true) {
    case menitDatang > menitTutup:
      return "ditolak";

    case menitDatang - menitMasuk > toleransiMenit:
      return "late";

    default:
      return "present";
  }
}

export type PenandaHarian = "holiday" | "leave" | "absent" | "lewati";

export interface KeadaanHarian {
  sudahAdaAbsensi: boolean;
  hariLibur: boolean;
  sedangCuti: boolean;
  hariKerja: boolean;
}

export function tentukanPenandaHarian(keadaan: KeadaanHarian): PenandaHarian {
  switch (true) {
    case keadaan.sudahAdaAbsensi:
      return "lewati";

    case keadaan.hariLibur:
      return "holiday";

    case keadaan.sedangCuti:
      return "leave";

    case !keadaan.hariKerja:
      return "lewati";

    default:
      return "absent";
  }
}
