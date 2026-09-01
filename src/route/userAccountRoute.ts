import { Router } from "express";
import {
  ListPendingUserController,
  ApproveUserController,
  SetUserActiveController,
} from "../controller/userAccountController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import { setUserActiveSchema } from "../schema/authSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const canManageRegistration = [
  authenticate,
  requireFeature("employee.approve_user"),
];

router.get(
  "/users/pending",
  ...canManageRegistration,
  ListPendingUserController,
);

router.patch(
  "/users/:id/approve",
  ...canManageRegistration,
  validateParams(idParamSchema),
  ApproveUserController,
);

router.patch(
  "/users/:id/status",
  ...canManageRegistration,
  validateParams(idParamSchema),
  validate(setUserActiveSchema),
  SetUserActiveController,
);

export default router;
