export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

const ALLOWED_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: LeaveStatus, to: LeaveStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: LeaveStatus): LeaveStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

const LABEL: Record<LeaveStatus, string> = {
  pending: "pending approval",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
};

export function statusLabel(status: LeaveStatus): string {
  return LABEL[status];
}
