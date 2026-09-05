import { logger } from "../config/logger.js";
import * as notificationModel from "../models/notification.js";
import * as featureModel from "../models/feature.js";
import * as employeeModel from "../models/employee.js";
import type { NewNotification, Notification } from "../models/notification.js";
import { pushTo, pushToMany } from "../realtime/hub.js";

// Notifikasi bersifat pelengkap kalau gagal disimpan, pengajuan cuti yang
// sudah berhasil tidak boleh ikut dibatalkan
// Bentuk yang dikirim lewat soket harus sama persis dengan yang dikirim
// GET /notifications, supaya frontend tidak perlu dua penanganan berbeda
function toPayload(row: Notification) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    is_read: row.is_read,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

// Database dulu, soket belakangan. Kalau urutannya dibalik, penerima bisa
// melihat notifikasi yang ternyata gagal disimpan
function persist(rows: NewNotification[]): void {
  if (rows.length === 0) return;

  void notificationModel
    .insertMany(rows)
    .then((saved) => {
      for (const row of saved) {
        pushTo(row.recipient_user_id, {
          event: "notification.created",
          data: toPayload(row),
        });
      }
    })
    .catch((err) => {
      logger.error(
        { err, type: rows[0]?.type, recipients: rows.length },
        "Gagal menyimpan notifikasi",
      );
    });
}

// Antrean yang sudah ditindak ikut dibersihkan di layar penerimanya, supaya
// lencana tidak menampilkan tugas yang sudah selesai
function clearPending(type: NewNotification["type"], entity_id: string): void {
  void notificationModel
    .deletePending(type, entity_id)
    .then((removed) => {
      if (removed.length === 0) return;

      pushToMany(
        removed.map((row) => row.recipient_user_id),
        { event: "notification.cleared", ids: removed.map((row) => row.id) },
      );
    })
    .catch((err) => {
      logger.error({ err, type, entity_id }, "Gagal menghapus notifikasi");
    });
}

function dateRangeLabel(start: string, end: string): string {
  return start === end ? start : `${start} sampai ${end}`;
}

export interface LeaveSubmittedInput {
  request_id: string;
  requester_name: string;
  approver_employee_id: string | null;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
}

// Penerimanya atasan langsung. Kalau karyawan belum punya atasan, jatuh ke
// siapa pun yang boleh menyetujui cuti mana saja, supaya pengajuan tidak
// menggantung tanpa ada yang tahu
export async function notifyLeaveSubmitted(
  input: LeaveSubmittedInput,
): Promise<void> {
  try {
    const approver = input.approver_employee_id
      ? await userIdOf(input.approver_employee_id)
      : null;

    const recipients = approver
      ? [approver]
      : await featureModel.findUserIdsWithFeature("leave.approve_all");

    persist(
      recipients.map((recipient_user_id) => ({
        recipient_user_id,
        type: "leave_approval_needed" as const,
        title: "Pengajuan cuti baru",
        message: `${input.requester_name} mengajukan ${input.leave_type_name} ${input.total_days} hari pada ${dateRangeLabel(input.start_date, input.end_date)}`,
        link: "/leave-management",
        entity: "leave_request",
        entity_id: input.request_id,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Gagal menentukan penerima notifikasi cuti");
  }
}

async function userIdOf(employee_id: string): Promise<string | null> {
  const employee = await employeeModel.findById(employee_id);

  return employee?.user_id ?? null;
}

export interface LeaveDecidedInput {
  request_id: string;
  requester_employee_id: string;
  decision: "approved" | "rejected";
  leave_type_name: string;
  start_date: string;
  end_date: string;
  decision_note?: string | null;
}

// Pemohon diberi tahu hasilnya, dan notifikasi "perlu disetujui" milik
// atasan dihapus karena sudah tidak ada yang perlu ditindak
export async function notifyLeaveDecided(
  input: LeaveDecidedInput,
): Promise<void> {
  clearPending("leave_approval_needed", input.request_id);

  const recipient = await userIdOf(input.requester_employee_id);
  if (!recipient) return;

  const decided = input.decision === "approved" ? "disetujui" : "ditolak";
  const note = input.decision_note ? `. Catatan: ${input.decision_note}` : "";

  persist([
    {
      recipient_user_id: recipient,
      type: "leave_status_changed",
      title: `Pengajuan cuti ${decided}`,
      message: `${input.leave_type_name} pada ${dateRangeLabel(input.start_date, input.end_date)} ${decided}${note}`,
      link: "/leave",
      entity: "leave_request",
      entity_id: input.request_id,
    },
  ]);
}

export interface AccountRegisteredInput {
  user_id: string;
  full_name: string;
  email: string;
}

// Dikirim ke semua yang boleh menyetujui pendaftaran. Indeks unik menjaga
// satu penerima hanya mendapat satu notifikasi per akun
export async function notifyAccountNeedsApproval(
  input: AccountRegisteredInput,
): Promise<void> {
  try {
    const recipients = await featureModel.findUserIdsWithFeature(
      "employee.approve_user",
    );

    persist(
      recipients.map((recipient_user_id) => ({
        recipient_user_id,
        type: "account_approval_needed" as const,
        title: "Akun baru menunggu persetujuan",
        message: `${input.full_name} (${input.email}) mendaftar dan menunggu persetujuan`,
        link: "/approval",
        entity: "user",
        entity_id: input.user_id,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Gagal menentukan penerima notifikasi pendaftaran");
  }
}

// Persetujuan akun sudah diputus, notifikasi antreannya tidak relevan lagi
export function clearAccountApproval(user_id: string): void {
  clearPending("account_approval_needed", user_id);
}
