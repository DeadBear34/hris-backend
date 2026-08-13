import { Router } from "express";
import {
  RegisterController,
  LoginController,
  MeController,
  ChangePasswordController,
  ListPendingUserController,
  ApproveUserController,
  SetUserActiveController,
  VerifyEmailController,
  ResendVerificationController,
  ForgotPasswordController,
  ResetPasswordController,
} from "../controller/userController.js";
import {
  ListEmployeeController,
  DetailEmployeeController,
  CreateEmployeeController,
  UpdateEmployeeController,
  DeleteEmployeeController,
} from "../controller/employeeController.js";
import {
  ListDepartmentController,
  DetailDepartmentController,
  CreateDepartmentController,
  UpdateDepartmentController,
  DeleteDepartmentController,
} from "../controller/departmentController.js";
import {
  ListPositionController,
  DetailPositionController,
  CreatePositionController,
  UpdatePositionController,
  DeletePositionController,
} from "../controller/positionController.js";
import {
  ListHolidayController,
  DetailHolidayController,
  CreateHolidayController,
  UpdateHolidayController,
  DeleteHolidayController,
} from "../controller/holidayController.js";
import {
  ListLeaveTypeController,
  DetailLeaveTypeController,
  CreateLeaveTypeController,
  UpdateLeaveTypeController,
  DeleteLeaveTypeController,
} from "../controller/leaveTypeController.js";
import {
  ListMyLeaveRequestController,
  ListApprovalLeaveRequestController,
  ListAllLeaveRequestController,
  DetailLeaveRequestController,
  CreateLeaveRequestController,
  ApproveLeaveRequestController,
  RejectLeaveRequestController,
  CancelLeaveRequestController,
} from "../controller/leaveRequestController.js";
import {
  MyLeaveBalanceController,
  EmployeeLeaveBalanceController,
  MyLeaveLedgerController,
  AdjustLeaveBalanceController,
} from "../controller/leaveBalanceController.js";
import {
  UploadLeaveAttachmentController,
  ListLeaveAttachmentController,
  SignedUrlLeaveAttachmentController,
} from "../controller/leaveAttachmentController.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { uploadSingleImage } from "../middlewares/upload.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  setUserActiveSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schema/authSchema.js";
import {
  listEmployeeQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../schema/employeeSchema.js";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../schema/departmentSchema.js";
import {
  createPositionSchema,
  updatePositionSchema,
} from "../schema/positionSchema.js";
import {
  listHolidayQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
} from "../schema/holidaySchema.js";
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
} from "../schema/leaveTypeSchema.js";
import {
  listLeaveRequestQuerySchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
} from "../schema/leaveRequestSchema.js";
import {
  balanceQuerySchema,
  listLedgerQuerySchema,
  adjustBalanceSchema,
} from "../schema/leaveBalanceSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const adminOnly = [authenticate, authorize("admin")];

router.post("/auth/register", validate(registerSchema), RegisterController);

router.post("/auth/login", validate(loginSchema), LoginController);

router.post(
  "/auth/verify-email",
  validate(verifyEmailSchema),
  VerifyEmailController,
);

router.post(
  "/auth/resend-verification",
  validate(resendVerificationSchema),
  ResendVerificationController,
);

router.post(
  "/auth/forgot-password",
  validate(forgotPasswordSchema),
  ForgotPasswordController,
);

router.post(
  "/auth/reset-password",
  validate(resetPasswordSchema),
  ResetPasswordController,
);

router.get("/auth/me", ...loggedIn, MeController);

router.patch(
  "/auth/password",
  ...loggedIn,
  validate(changePasswordSchema),
  ChangePasswordController,
);

router.get("/users/pending", ...adminOnly, ListPendingUserController);

router.patch(
  "/users/:id/approve",
  ...adminOnly,
  validateParams(idParamSchema),
  ApproveUserController,
);

router.patch(
  "/users/:id/status",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(setUserActiveSchema),
  SetUserActiveController,
);

router.get(
  "/employees",
  ...adminOnly,
  validateQuery(listEmployeeQuerySchema),
  ListEmployeeController,
);

router.post(
  "/employees",
  ...adminOnly,
  validate(createEmployeeSchema),
  CreateEmployeeController,
);

router.get(
  "/employees/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DetailEmployeeController,
);

router.patch(
  "/employees/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(updateEmployeeSchema),
  UpdateEmployeeController,
);

router.delete(
  "/employees/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DeleteEmployeeController,
);

router.get("/departments", ...loggedIn, ListDepartmentController);

router.get(
  "/departments/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailDepartmentController,
);

router.post(
  "/departments",
  ...adminOnly,
  validate(createDepartmentSchema),
  CreateDepartmentController,
);

router.patch(
  "/departments/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(updateDepartmentSchema),
  UpdateDepartmentController,
);

router.delete(
  "/departments/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DeleteDepartmentController,
);

router.get("/positions", ...loggedIn, ListPositionController);

router.get(
  "/positions/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailPositionController,
);

router.post(
  "/positions",
  ...adminOnly,
  validate(createPositionSchema),
  CreatePositionController,
);

router.patch(
  "/positions/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(updatePositionSchema),
  UpdatePositionController,
);

router.delete(
  "/positions/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DeletePositionController,
);

// ---------------------------------------------------------------
// Hari libur
// Dibaca semua pengguna karena dipakai menghitung durasi cuti,
// hanya HR dan admin yang boleh mengubahnya
// ---------------------------------------------------------------

router.get(
  "/holidays",
  ...loggedIn,
  validateQuery(listHolidayQuerySchema),
  ListHolidayController,
);

router.get(
  "/holidays/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailHolidayController,
);

router.post(
  "/holidays",
  ...adminOnly,
  validate(createHolidaySchema),
  CreateHolidayController,
);

router.patch(
  "/holidays/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(updateHolidaySchema),
  UpdateHolidayController,
);

router.delete(
  "/holidays/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DeleteHolidayController,
);

// ---------------------------------------------------------------
// Jenis cuti
// ---------------------------------------------------------------

router.get("/leave-types", ...loggedIn, ListLeaveTypeController);

router.get(
  "/leave-types/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailLeaveTypeController,
);

router.post(
  "/leave-types",
  ...adminOnly,
  validate(createLeaveTypeSchema),
  CreateLeaveTypeController,
);

router.patch(
  "/leave-types/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(updateLeaveTypeSchema),
  UpdateLeaveTypeController,
);

router.delete(
  "/leave-types/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DeleteLeaveTypeController,
);

// ---------------------------------------------------------------
// Saldo cuti
// Didaftarkan sebelum rute berparameter agar tidak tertangkap /:id
// ---------------------------------------------------------------

router.get(
  "/leave-balances/me",
  ...loggedIn,
  validateQuery(balanceQuerySchema),
  MyLeaveBalanceController,
);

router.get(
  "/leave-balances/me/ledger",
  ...loggedIn,
  validateQuery(listLedgerQuerySchema),
  MyLeaveLedgerController,
);

router.post(
  "/leave-balances/adjustments",
  ...adminOnly,
  validate(adjustBalanceSchema),
  AdjustLeaveBalanceController,
);

router.get(
  "/leave-balances/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validateQuery(balanceQuerySchema),
  EmployeeLeaveBalanceController,
);

// ---------------------------------------------------------------
// Pengajuan cuti
// ---------------------------------------------------------------

router.get(
  "/leave-requests/me",
  ...loggedIn,
  validateQuery(listLeaveRequestQuerySchema),
  ListMyLeaveRequestController,
);

router.get(
  "/leave-requests/approvals",
  ...loggedIn,
  validateQuery(listLeaveRequestQuerySchema),
  ListApprovalLeaveRequestController,
);

router.get(
  "/leave-requests",
  ...adminOnly,
  validateQuery(listLeaveRequestQuerySchema),
  ListAllLeaveRequestController,
);

router.post(
  "/leave-requests",
  ...loggedIn,
  validate(createLeaveRequestSchema),
  CreateLeaveRequestController,
);

router.get(
  "/leave-requests/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailLeaveRequestController,
);

router.patch(
  "/leave-requests/:id/approve",
  ...loggedIn,
  validateParams(idParamSchema),
  validate(decideLeaveRequestSchema),
  ApproveLeaveRequestController,
);

router.patch(
  "/leave-requests/:id/reject",
  ...loggedIn,
  validateParams(idParamSchema),
  validate(decideLeaveRequestSchema),
  RejectLeaveRequestController,
);

router.patch(
  "/leave-requests/:id/cancel",
  ...loggedIn,
  validateParams(idParamSchema),
  CancelLeaveRequestController,
);

// ---------------------------------------------------------------
// Lampiran pengajuan cuti
// ---------------------------------------------------------------

router.get(
  "/leave-requests/:id/attachments",
  ...loggedIn,
  validateParams(idParamSchema),
  ListLeaveAttachmentController,
);

router.post(
  "/leave-requests/:id/attachments",
  ...loggedIn,
  validateParams(idParamSchema),
  uploadSingleImage("file"),
  UploadLeaveAttachmentController,
);

router.get(
  "/leave-attachments/:id/url",
  ...loggedIn,
  validateParams(idParamSchema),
  SignedUrlLeaveAttachmentController,
);

export default router;
