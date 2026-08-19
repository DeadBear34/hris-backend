import { Router } from "express";
import {
  LoginController,
  MeController,
  UpdateMeController,
  ChangePasswordController,
} from "../controller/authController.js";
import {
  RegisterController,
  VerifyEmailController,
  ResendVerificationController,
  ForgotPasswordController,
  ResetPasswordController,
} from "../controller/accountVerificationController.js";
import { authenticate } from "../middlewares/auth.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schema/authSchema.js";
import { updateOwnProfileSchema } from "../schema/employeeSchema.js";

const router = Router();
const loggedIn = [authenticate];

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
  "/auth/me",
  ...loggedIn,
  validate(updateOwnProfileSchema),
  UpdateMeController,
);

router.patch(
  "/auth/password",
  ...loggedIn,
  validate(changePasswordSchema),
  ChangePasswordController,
);

export default router;
