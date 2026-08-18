import { Router } from "express";
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
  UploadLeaveAttachmentController,
  ListLeaveAttachmentController,
  SignedUrlLeaveAttachmentController,
} from "../controller/leaveAttachmentController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import { uploadSingleImage } from "../middlewares/upload.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  listLeaveRequestQuerySchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
} from "../schema/leaveRequestSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

// Pengajuan cuti beserta lampirannya
const router = Router();
const loggedIn = [authenticate];
const bolehLihatSemuaCuti = [authenticate, requireFeature("leave.view_all")];

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
  ...bolehLihatSemuaCuti,
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
