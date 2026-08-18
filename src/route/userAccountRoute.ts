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

// Pengelolaan akun oleh admin
const router = Router();
const loggedIn = [authenticate];
const bolehKelolaPendaftaran = [
  authenticate,
  requireFeature("employee.approve_user"),
];

router.get(
  "/users/pending",
  ...bolehKelolaPendaftaran,
  ListPendingUserController,
);

router.patch(
  "/users/:id/approve",
  ...bolehKelolaPendaftaran,
  validateParams(idParamSchema),
  ApproveUserController,
);

router.patch(
  "/users/:id/status",
  ...bolehKelolaPendaftaran,
  validateParams(idParamSchema),
  validate(setUserActiveSchema),
  SetUserActiveController,
);

export default router;
