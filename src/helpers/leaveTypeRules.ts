import { ZodError } from "zod";

export interface LeaveTypeLimits {
  default_quota?: number | null;
  deducts_balance?: boolean;
  requires_attachment?: boolean;
  attachment_required_after?: number | null;
  max_days_per_request?: number | null;
}

export interface FieldIssue {
  field: string;
  message: string;
}

// Aturan antarkolom yang tidak bisa diperiksa per kolom. Untuk perubahan
// sebagian, nilai yang dikirim harus sudah digabung dengan nilai tersimpan
export function leaveTypeLimitIssues(values: LeaveTypeLimits): FieldIssue[] {
  const issues: FieldIssue[] = [];

  const quota = values.default_quota ?? null;
  const maxDays = values.max_days_per_request ?? null;
  const threshold = values.attachment_required_after ?? 0;

  // Lampiran diminta bila durasi melebihi ambang. Ambang yang menyamai atau
  // melewati batas per pengajuan tidak akan pernah tercapai
  if (values.requires_attachment && maxDays !== null && threshold >= maxDays) {
    issues.push({
      field: "attachment_required_after",
      message: `Attachment threshold must be lower than the max days per request (${maxDays}), otherwise an attachment is never required`,
    });
  }

  const deducts = values.deducts_balance !== false;

  // Saldo hanya dibagikan untuk jatah di atas 0, jadi cuti yang memotong
  // saldo tanpa jatah tidak akan pernah bisa diajukan siapa pun
  if (deducts && (quota === null || Number(quota) <= 0)) {
    issues.push({
      field: "default_quota",
      message:
        "A leave type that deducts balance needs a default quota of at least 1 day",
    });
  }

  // Cuti yang memotong saldo tidak bisa diajukan melebihi jatahnya
  else if (deducts && maxDays !== null && maxDays > Number(quota)) {
    issues.push({
      field: "max_days_per_request",
      message: `Max days per request cannot exceed the leave quota (${Number(quota)} days)`,
    });
  }

  return issues;
}

// Dilempar sebagai ZodError supaya bentuk respons 400-nya sama persis dengan
// kegagalan validasi biasa, jadi frontend cukup membaca satu format
export function assertLeaveTypeLimits(values: LeaveTypeLimits): void {
  const issues = leaveTypeLimitIssues(values);
  if (issues.length === 0) return;

  throw new ZodError(
    issues.map((issue) => ({
      code: "custom" as const,
      path: [issue.field],
      message: issue.message,
      input: undefined,
    })),
  );
}
