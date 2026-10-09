import * as balanceModel from "../models/leaveBalance.js";
import { withTransaction } from "./transaction.js";
import { todayInOfficeZone } from "./timezone.js";

// Tahun cuti mengikuti zona waktu kantor. Tahun UTC baru berganti pukul
// 07.00 WIB tanggal 1 Januari, sehingga tujuh jam pertama tahun baru masih
// terbaca sebagai tahun lalu
export function currentLeaveYear(at: Date = new Date()): number {
  return Number(todayInOfficeZone(at).slice(0, 4));
}

// Jatah hanya diberikan untuk tahun berjalan dan tahun depan. Tahun depan
// ikut karena cuti akhir Desember boleh diajukan untuk tanggal Januari.
// Tahun lampau sengaja tidak, supaya membuka riwayat lama tidak menciptakan
// jatah untuk tahun yang sudah lewat
export function isAccrualYear(period_year: number, at: Date = new Date()): boolean {
  const year = currentLeaveYear(at);

  return period_year === year || period_year === year + 1;
}

// Memastikan karyawan sudah menerima jatah tahunan untuk periode itu.
//
// Sebelumnya jatah hanya pernah dibuat oleh skrip seed, sehingga karyawan
// yang mendaftar atau ditambahkan admin, dan semua karyawan begitu berganti
// tahun, bersaldo nol dan setiap pengajuan cutinya ditolak.
//
// Pemeriksaan pertama tanpa kunci supaya kasus umum (jatah sudah ada) tidak
// membuka transaksi. Penulisan dilakukan di bawah kunci baris karyawan yang
// sama dengan pengajuan cuti, jadi permintaan bersamaan tidak membuat jatah
// tercatat dua kali
export async function ensureAccruals(
  employee_id: string,
  period_year: number,
): Promise<void> {
  if (!isAccrualYear(period_year)) return;

  if (!(await balanceModel.hasMissingAccruals(employee_id, period_year))) {
    return;
  }

  await withTransaction(async (client) => {
    await balanceModel.lockEmployeeBalance(client, employee_id);
    await balanceModel.grantAccruals(client, [employee_id], period_year);
  });
}
