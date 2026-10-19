// baru: pindahin penyetuju cuti pending kalau struktur berubah
import { logger } from "../config/logger.js";
import * as leaveRequestModel from "../models/leaveRequest.js";
import { findLineManager } from "../models/orgStructure.js";
import { notifyApproverReassigned } from "./notify.js";

export interface RerouteResult {
  request_id: string;
  employee_id: string;
  from_approver_id: string | null;
  to_approver_id: string | null;
}

// Menghitung ulang penyetuju semua pengajuan cuti yang masih menunggu.
//
// Penyetuju dibekukan saat pengajuan dibuat. Bila sesudahnya struktur berubah
// (karyawan pindah jabatan, atasan keluar atau dinonaktifkan, atasan jabatan
// diganti), penyetuju lama bisa sudah tidak berwenang sementara atasan yang
// baru tidak tahu ada pengajuan. Pola standar sistem HR adalah mengalihkan
// persetujuan yang menunggu ke atasan yang berlaku sekarang.
//
// Semua pengajuan yang menunggu dihitung ulang, bukan hanya yang terdampak,
// karena perubahan satu jabatan bisa menggeser atasan seluruh cabangnya.
// Jumlah pengajuan yang menunggu di HRIS kecil, jadi biayanya wajar
export async function reroutePendingApprovals(): Promise<RerouteResult[]> {
  const pending = await leaveRequestModel.findPendingForRouting();
  const results: RerouteResult[] = [];

  for (const request of pending) {
    const manager = await findLineManager(request.employee_id);
    const to = manager?.employee_id ?? null;

    if (to === request.approver_id) continue;

    const moved = await leaveRequestModel.reassignApprover(
      request.id,
      request.approver_id,
      to,
    );
    if (!moved) continue;

    results.push({
      request_id: request.id,
      employee_id: request.employee_id,
      from_approver_id: request.approver_id,
      to_approver_id: to,
    });

    await notifyApproverReassigned({
      request_id: request.id,
      requester_name: request.employee_name,
      leave_type_name: request.leave_type_name,
      start_date: request.start_date,
      end_date: request.end_date,
      total_days: request.total_days,
      from_employee_id: request.approver_id,
      to_employee_id: to,
    });
  }

  if (results.length > 0) {
    logger.info(
      { rerouted: results },
      `Leave approvals rerouted after an organization change: ${results.length}`,
    );
  }

  return results;
}

// Dipanggil setelah perubahan struktur tersimpan. Pengalihan yang gagal tidak
// boleh menggagalkan perubahan yang sudah berhasil; pengajuan itu tetap bisa
// diputus HR dan admin, dan akan dialihkan lagi pada perubahan berikutnya
export async function rerouteSafely(): Promise<RerouteResult[]> {
  try {
    return await reroutePendingApprovals();
  } catch (err) {
    logger.error({ err }, "Failed to reroute pending leave approvals");
    return [];
  }
}
