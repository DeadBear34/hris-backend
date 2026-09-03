import { Router } from "express";
import {
  ListLeaveTypeController,
  DetailLeaveTypeController,
  CreateLeaveTypeController,
  UpdateLeaveTypeController,
  DeleteLeaveTypeController,
} from "../controller/leaveTypeController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
} from "../schema/leaveTypeSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const canManageLeaveTypes = [authenticate, requireFeature("leave.manage_type")];

router.get("/leave-types", ...loggedIn, ListLeaveTypeController);

router.get(
  "/leave-types/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailLeaveTypeController,
);

router.post(
  "/leave-types",
  ...canManageLeaveTypes,
  validate(createLeaveTypeSchema),
  CreateLeaveTypeController,
);

router.patch(
  "/leave-types/:id",
  ...canManageLeaveTypes,
  validateParams(idParamSchema),
  validate(updateLeaveTypeSchema),
  UpdateLeaveTypeController,
);

router.delete(
  "/leave-types/:id",
  ...canManageLeaveTypes,
  validateParams(idParamSchema),
  DeleteLeaveTypeController,
);

export default router;
