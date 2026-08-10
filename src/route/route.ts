import { Router } from "express";
import {
  RegisterController,
  LoginController,
  MeController,
  ChangePasswordController,
  ListPendingUserController,
  ApproveUserController,
  SetUserActiveController,
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
import { authenticate, authorize } from "../middlewares/auth.js";
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
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const hrOnly = [authenticate, authorize("hr", "admin")];

router.post("/auth/register", validate(registerSchema), RegisterController);

router.post("/auth/login", validate(loginSchema), LoginController);

router.get("/auth/me", ...loggedIn, MeController);

router.patch(
  "/auth/password",
  ...loggedIn,
  validate(changePasswordSchema),
  ChangePasswordController,
);

router.get("/users/pending", ...hrOnly, ListPendingUserController);

router.patch(
  "/users/:id/approve",
  ...hrOnly,
  validateParams(idParamSchema),
  ApproveUserController,
);

router.patch(
  "/users/:id/status",
  ...hrOnly,
  validateParams(idParamSchema),
  validate(setUserActiveSchema),
  SetUserActiveController,
);

router.get(
  "/employees",
  ...hrOnly,
  validateQuery(listEmployeeQuerySchema),
  ListEmployeeController,
);

router.post(
  "/employees",
  ...hrOnly,
  validate(createEmployeeSchema),
  CreateEmployeeController,
);

router.get(
  "/employees/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  DetailEmployeeController,
);

router.patch(
  "/employees/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  validate(updateEmployeeSchema),
  UpdateEmployeeController,
);

router.delete(
  "/employees/:id",
  ...hrOnly,
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
  ...hrOnly,
  validate(createDepartmentSchema),
  CreateDepartmentController,
);

router.patch(
  "/departments/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  validate(updateDepartmentSchema),
  UpdateDepartmentController,
);

router.delete(
  "/departments/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  DeleteDepartmentController,
);

// ---------------------------------------------------------------
// Jabatan
// Aturan akses sama dengan departemen
// ---------------------------------------------------------------

router.get("/positions", ...loggedIn, ListPositionController);

router.get(
  "/positions/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailPositionController,
);

router.post(
  "/positions",
  ...hrOnly,
  validate(createPositionSchema),
  CreatePositionController,
);

router.patch(
  "/positions/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  validate(updatePositionSchema),
  UpdatePositionController,
);

router.delete(
  "/positions/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  DeletePositionController,
);

export default router;
