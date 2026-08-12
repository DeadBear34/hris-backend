import { z } from "zod";

const LEAVE_STATUS = ["pending", "approved", "rejected", "cancelled"] as const;

export const listLeaveRequestQuerySchema = z
  .object({
    status: z.enum(LEAVE_STATUS, { message: "Status cuti tidak valid" })
      .optional(),
    employee_id: z.uuid("Karyawan tidak valid").optional(),
    leave_type_id: z.uuid("Jenis cuti tidak valid").optional(),
    start_date: z.iso.date("Tanggal awal tidak valid").optional(),
    end_date: z.iso.date("Tanggal akhir tidak valid").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine(
    (data) =>
      !data.start_date || !data.end_date || data.start_date <= data.end_date,
    {
      message: "Tanggal akhir tidak boleh lebih awal dari tanggal awal",
      path: ["end_date"],
    },
  );

export const createLeaveRequestSchema = z
  .object({
    leave_type_id: z.uuid("Jenis cuti wajib dipilih"),

    start_date: z.iso.date("Tanggal mulai tidak valid"),
    end_date: z.iso.date("Tanggal selesai tidak valid"),

    reason: z
      .string()
      .trim()
      .max(500, "Alasan maksimal 500 karakter")
      .optional(),
  })
  .refine((data) => data.start_date <= data.end_date, {
    message: "Tanggal selesai tidak boleh lebih awal dari tanggal mulai",
    path: ["end_date"],
  });

export const decideLeaveRequestSchema = z.object({
  decision_note: z
    .string()
    .trim()
    .max(500, "Catatan keputusan maksimal 500 karakter")
    .optional(),
});
