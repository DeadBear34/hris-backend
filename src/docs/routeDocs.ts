import { z, type ZodType } from "zod";
import {
  createEmployeeSchema,
  MAX_EMPLOYEES_PER_REQUEST,
} from "../schema/employeeSchema.js";

// Teks yang dibaca manusia untuk setiap endpoint, dalam bahasa Inggris.
// Hanya tayang di Dokumentasi API dalam aplikasi (fitur system.view_api_docs),
// tidak di situs publik docs.hris.click. Field, tipe, aturan validasi,
// autentikasi, dan hak akses TIDAK ditulis di sini: semuanya dibaca otomatis
// dari route dan skema Zod-nya, sehingga tidak bisa tertinggal dari kode.
// Tes memastikan setiap route punya entri di sini.

export interface ErrorDoc {
  status: number;
  code: string;
  description: string;
}

export interface RouteDoc {
  tag: string;
  summary: string;
  description?: string;
  // status sukses bila bukan 200
  status?: number;
  // error khusus endpoint ini, di luar 400/401/403/404/429 yang otomatis
  errors?: ErrorDoc[];
  // endpoint yang dijaga rahasia cron, bukan token login
  security?: "cron";
  // pengganti skema body bila skema validasinya terlalu umum untuk dibaca
  body?: ZodType;
  // respons bukan pembungkus { success, data } biasa
  rawResponse?: boolean;
}

export const TAGS: { name: string; description: string }[] = [
  {
    name: "Authentication",
    description: "Registration, login, email verification, and password reset",
  },
  {
    name: "Profile",
    description: "Account and employee data of the signed-in user",
  },
  {
    name: "User Accounts",
    description: "Approval and status of self-registered accounts",
  },
  { name: "Employees", description: "Employee records and photos" },
  {
    name: "Departments",
    description: "Organizational units, including concurrent leave limits",
  },
  {
    name: "Positions & Permissions",
    description: "Positions and the features (permissions) granted to each",
  },
  {
    name: "Organization Structure",
    description:
      "Organization chart and line managers derived from the position structure",
  },
  { name: "Holidays", description: "Public holidays and collective leave" },
  { name: "Leave Types", description: "Leave type catalog" },
  {
    name: "Leave Requests",
    description:
      "Submitting, approving, rejecting, and cancelling leave, and its attachments",
  },
  {
    name: "Leave Balances",
    description: "Leave balances and their transaction history",
  },
  { name: "Work Schedules", description: "Work schedules per department" },
  {
    name: "Attendance",
    description: "Check-in and check-out, history, reports, and corrections",
  },
  { name: "Notifications", description: "User notifications" },
  {
    name: "Activity Logs",
    description: "Audit trail of every action that changes data",
  },
  { name: "Documentation", description: "This OpenAPI document" },
];

const STALE: ErrorDoc = {
  status: 409,
  code: "STALE_DATA",
  description:
    "The record was changed by someone else after it was loaded. Reload it and resend with the latest updated_at",
};

const STAFFING: ErrorDoc = {
  status: 409,
  code: "STAFFING_LIMIT_REACHED",
  description:
    "The department's concurrent leave limit is reached on some dates (details.full_dates)",
};

const conflict = (description: string): ErrorDoc => ({
  status: 409,
  code: "CONFLICT",
  description,
});

export const ROUTE_DOCS: Record<string, RouteDoc> = {
  // Authentication
  "POST /auth/register": {
    tag: "Authentication",
    summary: "Register an account",
    description:
      "The account cannot sign in until the email is verified with the 6-digit code sent to it and an administrator approves the account.",
    status: 201,
    errors: [conflict("Email or phone number is already registered")],
  },
  "POST /auth/login": {
    tag: "Authentication",
    summary: "Sign in",
    description:
      "Returns `data.token` (JWT, valid for 24 hours). Limited to 5 attempts per minute for each IP and email pair. The rejection reason is in `details.reason`.",
    errors: [
      {
        status: 401,
        code: "UNAUTHORIZED",
        description:
          "Wrong email or password, email not verified, account not approved, or account inactive",
      },
    ],
  },
  "POST /auth/logout": {
    tag: "Authentication",
    summary: "Sign out",
    description:
      "Revokes the token used by this request until it expires, so it is rejected (401) even before its expiry. Tokens on other devices stay valid; change the password to sign out everywhere.",
  },
  "POST /auth/verify-email": {
    tag: "Authentication",
    summary: "Verify an email with the 6-digit code",
    description: "At most 5 attempts per code.",
  },
  "POST /auth/resend-verification": {
    tag: "Authentication",
    summary: "Resend the verification code",
    description:
      "Always returns the same response, even for unregistered emails, so it cannot be used to discover accounts.",
    errors: [
      {
        status: 429,
        code: "TOO_MANY_REQUESTS",
        description: "Requested again too soon",
      },
    ],
  },
  "GET /auth/verification-code": {
    tag: "Authentication",
    summary: "Issue a verification code for QA (administrators only)",
    description:
      "Issues a new verification code for an unverified account and returns it in the response without sending an email. Earlier codes stop working. Disabled in production unless `QA_TOOLS_ENABLED=true`; when disabled it responds 404 like a missing route.",
    errors: [
      {
        status: 404,
        code: "NOT_FOUND",
        description: "Email not registered, or QA tools are disabled",
      },
      {
        status: 409,
        code: "CONFLICT",
        description: "Email is already verified",
      },
    ],
  },
  "POST /auth/forgot-password": {
    tag: "Authentication",
    summary: "Request a password reset link",
    description:
      "The link is valid for 15 minutes. Always returns the same response, even for unregistered emails.",
  },
  "POST /auth/reset-password": {
    tag: "Authentication",
    summary: "Set a new password from the reset link",
    description:
      "Send the `token` and `email` from the link. All existing sessions are invalidated.",
  },

  // Profile
  "GET /auth/me": {
    tag: "Profile",
    summary: "Get my profile",
    description: "Account, employee record, and the feature codes I hold.",
  },
  "PATCH /auth/me": {
    tag: "Profile",
    summary: "Update my profile",
    errors: [conflict("Phone number is used by someone else"), STALE],
  },
  "PATCH /auth/password": {
    tag: "Profile",
    summary: "Change my password",
    description:
      "On success, every existing token is invalidated and the user must sign in again.",
    errors: [
      {
        status: 401,
        code: "UNAUTHORIZED",
        description: "Current password is incorrect",
      },
    ],
  },
  "POST /auth/me/photo": {
    tag: "Profile",
    summary: "Upload my profile photo",
    description:
      "Image up to 5 MB. The file type is detected from its content.",
  },
  "DELETE /auth/me/photo": {
    tag: "Profile",
    summary: "Delete my profile photo",
  },
  "GET /me/features": {
    tag: "Profile",
    summary: "List my features",
    description: "Administrators automatically hold every feature.",
  },

  // User accounts
  "GET /users/pending": {
    tag: "User Accounts",
    summary: "List accounts awaiting approval",
    description: "Only accounts whose email is verified.",
  },
  "PATCH /users/:id/approve": {
    tag: "User Accounts",
    summary: "Approve an account",
    description: "Accounts with an unverified email cannot be approved (400).",
  },
  "PATCH /users/:id/status": {
    tag: "User Accounts",
    summary: "Activate or deactivate an account",
    description:
      "Inactive accounts cannot sign in. Pending leave requests are rerouted to the current line managers.",
  },

  // Employees
  "GET /employees": {
    tag: "Employees",
    summary: "List employees",
    description: "Limited to 100 requests per minute per user.",
  },
  "POST /employees": {
    tag: "Employees",
    summary: "Create one or more employees",
    description: `Send one object, or an array of at most ${MAX_EMPLOYEES_PER_REQUEST} objects. If any row fails, nothing is saved; per-row details are in \`details.failed_rows[]\`. The department is taken from the position's unit. New employees must change their password on first sign-in. Limited to 20 requests per minute.`,
    status: 201,
    body: z.union([
      createEmployeeSchema,
      z.array(createEmployeeSchema).min(1).max(MAX_EMPLOYEES_PER_REQUEST),
    ]),
    errors: [conflict("Email or phone number is already in use")],
  },
  "GET /employees/:id": { tag: "Employees", summary: "Get an employee" },
  "PATCH /employees/:id": {
    tag: "Employees",
    summary: "Update an employee",
    description:
      "Send `null` to clear the address, department, position, manager override, or resignation date. Changing the position, manager override, or active status reroutes pending leave requests.",
    errors: [conflict("Phone number is used by another employee"), STALE],
  },
  "DELETE /employees/:id": {
    tag: "Employees",
    summary: "Delete an employee",
    description:
      "Soft-deletes the employee and their account. Rejected (400) while they are still another employee's manager.",
  },
  "POST /employees/:id/photo": {
    tag: "Employees",
    summary: "Upload an employee photo",
    description: "Image up to 5 MB.",
  },
  "DELETE /employees/:id/photo": {
    tag: "Employees",
    summary: "Delete an employee photo",
  },

  // Departments
  "GET /departments": { tag: "Departments", summary: "List departments" },
  "GET /departments/:id": { tag: "Departments", summary: "Get a department" },
  "POST /departments": {
    tag: "Departments",
    summary: "Create a department",
    description:
      "`parent_id` places the unit under another unit. `max_concurrent_leave` limits how many of its employees may be on leave on the same day; empty means no limit.",
    status: 201,
    errors: [conflict("Code or name is already in use")],
  },
  "PATCH /departments/:id": {
    tag: "Departments",
    summary: "Update a department",
    description:
      "Send `max_concurrent_leave: null` to remove the concurrent leave limit. Moving a unit is rejected if it would cut its head position off from its superior.",
    errors: [conflict("Code or name is already in use"), STALE],
  },
  "DELETE /departments/:id": {
    tag: "Departments",
    summary: "Delete a department",
    description:
      "Rejected (400) while it still has employees, sub-units, or positions.",
  },

  // Organization structure
  "GET /org/tree": {
    tag: "Organization Structure",
    summary: "Get the organization chart",
    description:
      "Nested organizational units (`children`), the positions of each unit with their reports in the same unit (`direct_reports`), and the holders of each position (`holders`). A unit head appears in its own unit, with `reports_to_position_id` pointing to a position in the parent unit. Legacy positions without a unit are listed in `unassigned_positions`.",
  },
  "GET /employees/:id/line-manager": {
    tag: "Organization Structure",
    summary: "Get an employee's line manager",
    description:
      "The person who approves this employee's leave. `source: override` means it was set manually through `manager_id`; `structure` means it was derived from the superior position, skipping vacant positions (`levels_up` greater than 1). `line_manager: null` means there is no active manager up to the top, so HR and administrators handle the employee's leave.",
  },
  "GET /positions/:id/line-manager": {
    tag: "Organization Structure",
    summary: "Preview the line manager for a position",
    description:
      "The line manager an employee would get by holding this position, derived from the superior position while skipping vacant ones. Used by the employee forms to fill in the manager before saving. Set `exclude_employee_id` to the employee being edited so they are never chosen as their own manager. Manual overrides (`manager_id`) are not considered.",
  },
  "GET /positions": {
    tag: "Positions & Permissions",
    summary: "List positions",
  },
  "GET /positions/:id": {
    tag: "Positions & Permissions",
    summary: "Get a position",
  },
  "POST /positions": {
    tag: "Positions & Permissions",
    summary: "Create a position",
    description:
      "`department_id` is required. Codes and names are unique within a unit. The placement is validated against the structure rules (no cycles, unit heads report to the parent unit, one top position).",
    status: 201,
    errors: [conflict("Code or name is already in use in this unit")],
  },
  "PATCH /positions/:id": {
    tag: "Positions & Permissions",
    summary: "Update a position",
    description:
      "Changing the unit, superior, or unit head flag reroutes pending leave requests. A position cannot move to another unit while positions still report to it.",
    errors: [conflict("Code or name is already in use in this unit"), STALE],
  },
  "DELETE /positions/:id": {
    tag: "Positions & Permissions",
    summary: "Delete a position",
    description:
      "Rejected (400) while it still has holders or positions reporting to it.",
  },
  "GET /features": {
    tag: "Positions & Permissions",
    summary: "List the feature catalog",
  },
  "GET /features/matrix": {
    tag: "Positions & Permissions",
    summary: "Get the feature matrix per position",
  },
  "GET /positions/:id/features": {
    tag: "Positions & Permissions",
    summary: "List a position's features",
  },
  "PUT /positions/:id/features": {
    tag: "Positions & Permissions",
    summary: "Replace a position's features",
    description:
      "The submitted list replaces every feature of the position. Unknown codes are rejected with `details.unknown_codes`.",
    errors: [STALE],
  },

  // Holidays
  "GET /holidays": { tag: "Holidays", summary: "List holidays" },
  "GET /holidays/:id": { tag: "Holidays", summary: "Get a holiday" },
  "POST /holidays": {
    tag: "Holidays",
    summary: "Create a holiday",
    description: "`date` is accepted as an alias for `holiday_date`.",
    status: 201,
    errors: [conflict("The date is already registered as a holiday")],
  },
  "PATCH /holidays/:id": {
    tag: "Holidays",
    summary: "Update a holiday",
    errors: [conflict("The date is already registered as a holiday"), STALE],
  },
  "DELETE /holidays/:id": { tag: "Holidays", summary: "Delete a holiday" },

  // Leave types
  "GET /leave-types": { tag: "Leave Types", summary: "List leave types" },
  "GET /leave-types/:id": { tag: "Leave Types", summary: "Get a leave type" },
  "POST /leave-types": {
    tag: "Leave Types",
    summary: "Create a leave type",
    description:
      "`exempt_from_staffing_limit` is meant for unplanned leave (sick, bereavement, maternity): it is never rejected by a department's concurrent leave limit, but still counts toward it.",
    status: 201,
    errors: [conflict("Code is already in use")],
  },
  "PATCH /leave-types/:id": {
    tag: "Leave Types",
    summary: "Update a leave type",
    errors: [conflict("Code is already in use"), STALE],
  },
  "DELETE /leave-types/:id": {
    tag: "Leave Types",
    summary: "Delete a leave type",
    description:
      "Rejected (400) once it has been used by a request; deactivate it instead.",
  },

  // Leave requests
  "GET /leave-requests/me": {
    tag: "Leave Requests",
    summary: "List my leave requests",
  },
  "GET /leave-requests/approvals": {
    tag: "Leave Requests",
    summary: "List requests awaiting my decision",
    description:
      "Holders of `leave.approve_team`: requests where they are the approver (direct reports). Holders of `leave.approve_all` and administrators: every request except their own, including those assigned to someone else. Empty when the user holds neither.",
  },
  "GET /leave-requests/department-calendar": {
    tag: "Leave Requests",
    summary: "Get the department leave calendar",
    description:
      "For each date: how many colleagues in the same department have approved leave (`on_leave`, excluding the requester), how many requests are still pending (`pending`, a warning only that does not fill the quota), and `is_full`. Counts only, no names. Other departments are visible only to holders of `leave.view_all`. At most 62 days.",
  },
  "GET /leave-requests": {
    tag: "Leave Requests",
    summary: "List all leave requests",
  },
  "POST /leave-requests": {
    tag: "Leave Requests",
    summary: "Submit a leave request",
    description:
      "For leave types that deduct balance, the balance is held immediately. Only sick leave may start in the past. The approver is the requester's line manager at submission time. The response includes `attachment_required`.",
    status: 201,
    errors: [
      conflict(
        "Overlaps another active request of the requester (details.conflicting_request_id)",
      ),
      STAFFING,
    ],
  },
  "GET /leave-requests/:id": {
    tag: "Leave Requests",
    summary: "Get a leave request",
    description:
      "Visible to the requester, the assigned approver, and holders of `leave.view_all` or `leave.approve_all`. Approvers and `leave.view_all` holders (not the requester) also receive `colleagues_on_leave`: colleagues in the same department whose pending or approved leave overlaps this request.",
  },
  "PATCH /leave-requests/:id/approve": {
    tag: "Leave Requests",
    summary: "Approve a leave request",
    description:
      "Nobody may approve their own leave (403), administrators included. Holders of `leave.approve_all` may approve above the department's concurrent leave limit with `override_staffing_limit: true` and a reason of at least 10 characters in `decision_note`; the override is recorded in the activity log.",
    errors: [conflict("The status changed, reload and try again"), STAFFING],
  },
  "PATCH /leave-requests/:id/reject": {
    tag: "Leave Requests",
    summary: "Reject a leave request",
    description:
      "Nobody may reject their own leave (403). The held balance is refunded.",
    errors: [conflict("The status changed, reload and try again")],
  },
  "PATCH /leave-requests/:id/cancel": {
    tag: "Leave Requests",
    summary: "Cancel my leave request",
    description:
      "Approved leave can be cancelled until its first day. The balance is refunded and attachments are permanently deleted.",
    errors: [conflict("The status changed, reload and try again")],
  },
  "GET /leave-requests/:id/attachments": {
    tag: "Leave Requests",
    summary: "List a request's attachments",
  },
  "POST /leave-requests/:id/attachments": {
    tag: "Leave Requests",
    summary: "Upload an attachment",
    description:
      "Only the requester, while the request is pending. Image up to 5 MB.",
    status: 201,
  },
  "GET /leave-attachments/:id/url": {
    tag: "Leave Requests",
    summary: "Get a temporary URL for an attachment",
  },

  // Leave balances
  "GET /leave-balances/me": {
    tag: "Leave Balances",
    summary: "Get my leave balances",
    description:
      "The annual allocation is created automatically the first time a balance for that year is read or used.",
  },
  "GET /leave-balances/me/ledger": {
    tag: "Leave Balances",
    summary: "List my balance transactions",
    description: "Types: accrual, hold, deduction, refund, adjustment.",
  },
  "GET /leave-balances/:id": {
    tag: "Leave Balances",
    summary: "Get an employee's leave balances",
  },
  "POST /leave-balances/adjustments": {
    tag: "Leave Balances",
    summary: "Adjust a balance manually",
    description:
      "A deduction that would make the balance negative is rejected (400) with `details.max_deduction`.",
    status: 201,
  },

  // Work schedules
  "GET /work-schedules/me": {
    tag: "Work Schedules",
    summary: "Get my work schedule",
  },
  "GET /work-schedules": {
    tag: "Work Schedules",
    summary: "List work schedules",
  },
  "GET /work-schedules/:id": {
    tag: "Work Schedules",
    summary: "Get a work schedule",
  },
  "POST /work-schedules": {
    tag: "Work Schedules",
    summary: "Create a work schedule",
    description:
      "An empty `department_id` makes it the default schedule (only one is allowed).",
    status: 201,
    errors: [
      conflict(
        "The department already has a schedule, or a default schedule already exists",
      ),
    ],
  },
  "PATCH /work-schedules/:id": {
    tag: "Work Schedules",
    summary: "Update a work schedule",
    errors: [conflict("The department already has a schedule"), STALE],
  },
  "DELETE /work-schedules/:id": {
    tag: "Work Schedules",
    summary: "Delete a work schedule",
    errors: [conflict("Still assigned to employees")],
  },

  // Attendance
  "GET /attendances/today": {
    tag: "Attendance",
    summary: "Get today's attendance status",
    description: "Includes `can_check_in` and `can_check_out`.",
  },
  "POST /attendances/check-in": {
    tag: "Attendance",
    summary: "Check in",
    status: 201,
    errors: [conflict("Already checked in today")],
  },
  "POST /attendances/check-out": {
    tag: "Attendance",
    summary: "Check out",
    errors: [conflict("Already checked out today")],
  },
  "GET /attendances/me": {
    tag: "Attendance",
    summary: "List my attendance",
  },
  "GET /attendances/team": {
    tag: "Attendance",
    summary: "List my direct reports' attendance",
  },
  "GET /attendances": { tag: "Attendance", summary: "List all attendance" },
  "GET /attendances/report": {
    tag: "Attendance",
    summary: "Get the monthly attendance report",
  },
  "GET /attendances/events": {
    tag: "Attendance",
    summary: "List attendance events",
    description:
      "Every check-in and check-out attempt, including rejected ones.",
  },
  "GET /attendances/offline-log": {
    tag: "Attendance",
    summary: "List offline attendance",
  },
  "PATCH /attendances/:id/correct": {
    tag: "Attendance",
    summary: "Correct an attendance record",
    errors: [STALE],
  },
  "POST /attendances/close-day": {
    tag: "Attendance",
    summary: "Close the day (manual trigger)",
    description:
      "The backend already closes days automatically every 15 minutes; this endpoint is for manual runs. Marks employees without an attendance row as `holiday`, `leave`, or `absent`. For today, `absent` is only given after the employee's check-in cutoff has passed; the rest are counted as `pending`. Future dates are rejected. Protected by the `x-cron-secret` header instead of a sign-in token.",
    security: "cron",
  },

  // Notifications
  "GET /notifications": {
    tag: "Notifications",
    summary: "List notifications",
  },
  "PATCH /notifications/read-all": {
    tag: "Notifications",
    summary: "Mark all as read",
  },
  "PATCH /notifications/:id/read": {
    tag: "Notifications",
    summary: "Mark one as read",
  },

  // Activity logs
  "GET /activity-logs": { tag: "Activity Logs", summary: "List activity logs" },

  // Documentation
  "GET /docs/openapi.json": {
    tag: "Documentation",
    summary: "Get the OpenAPI document",
    description:
      "This document, generated from the backend routes and validation schemas.",
    rawResponse: true,
  },
};
