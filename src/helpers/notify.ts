import { logger } from "../config/logger.js";
import * as notificationModel from "../models/notification.js";
import * as featureModel from "../models/feature.js";
import * as employeeModel from "../models/employee.js";
import type { NewNotification } from "../models/notification.js";
import { dispatch } from "../realtime/dispatcher.js";
import { toView } from "../realtime/event.js";
import { plural } from "./plural.js";

// Simpan dulu, baru dorong. Urutannya penting: jangan sampai penerima
// melihat notifikasi yang ternyata gagal disimpan
function persist(rows: NewNotification[]): void {
  if (rows.length === 0) return;

  void notificationModel
    .insertMany(rows)
    .then((saved) => {
      for (const row of saved) {
        dispatch([row.recipient_user_id], {
          event: "notification.created",
          data: toView(row),
        });
      }
    })
    .catch((err) => {
      logger.error(
        { err, type: rows[0]?.type, recipients: rows.length },
        "Failed to save notification",
      );
    });
}

// Hapus antrean yang sudah ditindak, lalu beri tahu penerimanya supaya
// lencana tidak menampilkan tugas yang sudah selesai
function clearPending(type: NewNotification["type"], entity_id: string): void {
  void notificationModel
    .deletePending(type, entity_id)
    .then((removed) => {
      if (removed.length === 0) return;

      dispatch(
        removed.map((row) => row.recipient_user_id),
        { event: "notification.cleared", ids: removed.map((row) => row.id) },
      );
    })
    .catch((err) => {
      logger.error({ err, type, entity_id }, "Failed to delete notification");
    });
}

function dateRangeLabel(start: string, end: string): string {
  return start === end ? start : `${start} to ${end}`;
}

export interface LeaveSubmittedInput {
  request_id: string;
  requester_employee_id: string;
  requester_name: string;
  approver_employee_id: string | null;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
}

// Penerimanya semua orang yang boleh memutus pengajuan ini, mengikuti aturan
// canDecide di leaveRequestController:
// atasan langsung, bila jabatannya memegang leave.approve_team
// semua admin dan pemegang leave.approve_all (misalnya HR Manager), karena
// mereka boleh memutus pengajuan siapa pun dan kotak masuknya berisi semua
// Pemohon tidak pernah diberi tahu tentang cutinya sendiri, karena ia tidak
// boleh memutusnya. Akun nonaktif atau terhapus sudah disaring oleh
// findUserIdsWithFeature
export async function notifyLeaveSubmitted(
  input: LeaveSubmittedInput,
): Promise<void> {
  try {
    const [approverUser, approveAll, approveTeam, requesterUser] =
      await Promise.all([
        input.approver_employee_id
          ? userIdOf(input.approver_employee_id)
          : null,
        featureModel.findUserIdsWithFeature("leave.approve_all"),
        input.approver_employee_id
          ? featureModel.findUserIdsWithFeature("leave.approve_team")
          : ([] as string[]),
        userIdOf(input.requester_employee_id),
      ]);

    // Set, supaya atasan yang sekaligus HR atau admin hanya menerima satu
    const recipients = new Set(approveAll);

    if (approverUser && approveTeam.includes(approverUser)) {
      recipients.add(approverUser);
    }

    if (requesterUser) recipients.delete(requesterUser);

    persist(
      [...recipients].map((recipient_user_id) => ({
        recipient_user_id,
        type: "leave_approval_needed" as const,
        title: "New leave request",
        message: `${input.requester_name} requested ${plural(input.total_days, "day")} of ${input.leave_type_name} for ${dateRangeLabel(input.start_date, input.end_date)}`,
        link: "/leave-management",
        entity: "leave_request",
        entity_id: input.request_id,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to determine leave notification recipients");
  }
}

async function userIdOf(employee_id: string): Promise<string | null> {
  const employee = await employeeModel.findById(employee_id);

  return employee?.user_id ?? null;
}

export interface LeaveDecidedInput {
  request_id: string;
  requester_employee_id: string;
  requester_name?: string;
  decision: "approved" | "rejected";
  leave_type_name: string;
  start_date: string;
  end_date: string;
  decision_note?: string | null;
  decided_by_name?: string | null;
  decider_user_id?: string | null;
}

// Pemohon dan orang-orang dengan fitur leave.view_all diberi tahu hasilnya.
// Bila disetujui, pesan memuat informasi siapa yang menyetujuinya.
// Notifikasi pengajuan untuk manajer tetap disimpan sebagai riwayat.
export async function notifyLeaveDecided(
  input: LeaveDecidedInput,
): Promise<void> {
  try {
    const [requesterEmployee, viewAllUsers] = await Promise.all([
      employeeModel.findById(input.requester_employee_id),
      featureModel.findUserIdsWithFeature("leave.view_all"),
    ]);

    const requesterUserId = requesterEmployee?.user_id ?? null;
    const requesterName =
      input.requester_name ?? requesterEmployee?.full_name ?? "Employee";

    const decided = input.decision === "approved" ? "approved" : "rejected";
    const note = input.decision_note ? `. Note: ${input.decision_note}` : "";

    const approvalSuffix =
      input.decision === "approved" && input.decided_by_name
        ? ` approved by ${input.decided_by_name}`
        : ` ${decided}`;

    const notifications: NewNotification[] = [];

    // Notifikasi untuk pemohon
    if (requesterUserId) {
      notifications.push({
        recipient_user_id: requesterUserId,
        type: "leave_status_changed",
        title: `Leave request ${decided}`,
        message: `${input.leave_type_name} for ${dateRangeLabel(input.start_date, input.end_date)}${approvalSuffix}${note}`,
        link: "/leave",
        entity: "leave_request",
        entity_id: input.request_id,
      });
    }

    // Notifikasi untuk yang menyetujui/memutus dan pemegang leave.view_all (kecuali pemohon)
    const otherRecipients = new Set(viewAllUsers);
    if (input.decider_user_id) otherRecipients.add(input.decider_user_id);
    if (requesterUserId) otherRecipients.delete(requesterUserId);

    for (const recipient_user_id of otherRecipients) {
      notifications.push({
        recipient_user_id,
        type: "leave_status_changed",
        title: `Leave request ${decided}`,
        message: `${requesterName}'s ${input.leave_type_name} for ${dateRangeLabel(input.start_date, input.end_date)}${approvalSuffix}${note}`,
        link: "/leave-management",
        entity: "leave_request",
        entity_id: input.request_id,
      });
    }

    persist(notifications);
  } catch (err) {
    logger.error(
      { err, request_id: input.request_id },
      "Failed to send leave decision notifications",
    );
  }
}

export interface AccountRegisteredInput {
  user_id: string;
  full_name: string;
  email: string;
}

// Dikirim ke semua yang boleh menyetujui pendaftaran, setelah pendaftar
// memasukkan kode verifikasi emailnya. Indeks unik menjaga satu penerima
// hanya mendapat satu notifikasi per akun
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
        title: "New account waiting for approval",
        message: `${input.full_name} (${input.email}) has verified their email and is waiting for approval`,
        link: "/approval",
        entity: "user",
        entity_id: input.user_id,
      })),
    );
  } catch (err) {
    logger.error(
      { err },
      "Failed to determine registration notification recipients",
    );
  }
}

// Persetujuan akun sudah diputus, notifikasi antreannya tidak relevan lagi
export function clearAccountApproval(user_id: string): void {
  clearPending("account_approval_needed", user_id);
}

// Pemohon membatalkan sendiri, tetapi notifikasi untuk manajer tetap disimpan
// sebagai riwayat dan tidak dihapus
export function clearLeaveApproval(_request_id: string): void {
  // sengaja tidak memanggil clearPending agar notifikasi tidak hilang
}
