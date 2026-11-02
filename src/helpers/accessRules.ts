// Fitur yang tidak berguna tanpa fitur lain. Halaman ubah karyawan, misalnya,
// tidak bisa dibuka tanpa daftar karyawan. Paket yang melanggar ditolak,
// supaya tidak ada pemegang yang punya tombol tetapi tidak punya halamannya
export const FEATURE_REQUIRES: Readonly<Record<string, readonly string[]>> = {
  "employee.create": ["employee.view_all"],
  "employee.update": ["employee.view_all"],
  "employee.delete": ["employee.view_all"],
  "employee.approve_user": ["employee.view_all"],
  "leave.approve_all": ["leave.view_all"],
  "leave.adjust_balance": ["leave.view_all"],
  "attendance.correct": ["attendance.view_all"],
  "attendance.report": ["attendance.view_all"],
};

// Fitur yang dapat mengubah atau menghapus data orang lain secara luas, atau
// membuka data sensitif. Ditandai supaya layar meminta konfirmasi tambahan
export const SENSITIVE_FEATURES: ReadonlySet<string> = new Set([
  "employee.delete",
  "leave.approve_all",
  "leave.adjust_balance",
  "attendance.correct",
  "organization.manage",
  "system.view_log",
  "system.view_api_docs",
]);

export interface MissingRequirement {
  code: string;
  requires: string[];
}

export function missingRequirements(codes: string[]): MissingRequirement[] {
  const granted = new Set(codes);

  return codes
    .map((code) => ({
      code,
      requires: (FEATURE_REQUIRES[code] ?? []).filter(
        (required) => !granted.has(required),
      ),
    }))
    .filter((item) => item.requires.length > 0);
}

// Perbedaan dua daftar fitur, untuk log aktivitas yang mudah dibaca
export function diffCodes(
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } {
  const was = new Set(before);
  const now = new Set(after);

  return {
    added: after.filter((code) => !was.has(code)).sort(),
    removed: before.filter((code) => !now.has(code)).sort(),
  };
}
