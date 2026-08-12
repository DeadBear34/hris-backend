export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

const TRANSISI_DIIZINKAN: Record<LeaveStatus, LeaveStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
};

export function canTransition(dari: LeaveStatus, ke: LeaveStatus): boolean {
  return TRANSISI_DIIZINKAN[dari].includes(ke);
}

export function allowedTransitions(dari: LeaveStatus): LeaveStatus[] {
  return [...TRANSISI_DIIZINKAN[dari]];
}

const LABEL: Record<LeaveStatus, string> = {
  pending: "menunggu persetujuan",
  approved: "disetujui",
  rejected: "ditolak",
  cancelled: "dibatalkan",
};

export function statusLabel(status: LeaveStatus): string {
  return LABEL[status];
}
