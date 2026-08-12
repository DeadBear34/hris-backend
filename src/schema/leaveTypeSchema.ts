import { z } from "zod";

export const createLeaveTypeSchema = z.object({
  code: z
    .string({ message: "Kode jenis cuti wajib diisi" })
    .trim()
    .toUpperCase()
    .min(2, "Kode jenis cuti minimal 2 karakter")
    .max(20, "Kode jenis cuti maksimal 20 karakter"),

  name: z
    .string({ message: "Nama jenis cuti wajib diisi" })
    .trim()
    .min(3, "Nama jenis cuti minimal 3 karakter")
    .max(100, "Nama jenis cuti maksimal 100 karakter"),

  default_quota: z.coerce
    .number()
    .min(0, "Jatah cuti tidak boleh negatif")
    .max(365, "Jatah cuti maksimal 365 hari")
    .nullable()
    .optional(),

  deducts_balance: z.boolean().optional(),
  is_paid: z.boolean().optional(),
  requires_attachment: z.boolean().optional(),

  attachment_required_after: z.coerce
    .number()
    .int("Ambang lampiran harus bilangan bulat")
    .min(1, "Ambang lampiran minimal 1 hari")
    .nullable()
    .optional(),

  max_days_per_request: z.coerce
    .number()
    .int("Batas hari per pengajuan harus bilangan bulat")
    .min(1, "Batas hari per pengajuan minimal 1")
    .max(365, "Batas hari per pengajuan maksimal 365")
    .nullable()
    .optional(),

  min_notice_days: z.coerce
    .number()
    .int("Minimal pemberitahuan harus bilangan bulat")
    .min(0, "Minimal pemberitahuan tidak boleh negatif")
    .max(365, "Minimal pemberitahuan maksimal 365 hari")
    .optional(),

  gender_restriction: z
    .enum(["male", "female"], { message: "Batasan gender tidak valid" })
    .nullable()
    .optional(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });
