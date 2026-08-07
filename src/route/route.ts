import { Router } from "express";
import {
  RegisterController,
  LoginController,
  MeController,
  ChangePasswordController,
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
const hrOnly = [authenticate, authorize("hr", "admin")];

router.post("/auth/register", validate(registerSchema), RegisterController);
router.post("/auth/login", validate(loginSchema), LoginController);
router.get("/auth/me", authenticate, MeController);
router.patch(
  "/auth/password",
  authenticate,
  validate(changePasswordSchema),
  ChangePasswordController,
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

router.get("/departments", authenticate, ListDepartmentController);
router.post(
  "/departments",
  ...hrOnly,
  validate(createDepartmentSchema),
  CreateDepartmentController,
);
router.get(
  "/departments/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  DetailDepartmentController,
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

router.get("/positions", authenticate, ListPositionController);
router.post(
  "/positions",
  ...hrOnly,
  validate(createPositionSchema),
  CreatePositionController,
);
router.get(
  "/positions/:id",
  ...hrOnly,
  validateParams(idParamSchema),
  DetailPositionController,
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
