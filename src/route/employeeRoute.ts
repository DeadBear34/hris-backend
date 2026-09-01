import { Router } from "express";
import {
  ListEmployeeController,
  DetailEmployeeController,
  CreateEmployeeController,
  UpdateEmployeeController,
  DeleteEmployeeController,
} from "../controller/employeeController.js";
import {
  UploadEmployeePhotoController,
  DeleteEmployeePhotoController,
} from "../controller/employeePhotoController.js";
import { authenticate } from "../middlewares/auth.js";
import { uploadSingleImage } from "../middlewares/upload.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  listEmployeeQuerySchema,
  createEmployeePayloadSchema,
  updateEmployeeSchema,
} from "../schema/employeeSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const canViewEmployees = [authenticate, requireFeature("employee.view_all")];
const canCreateEmployees = [authenticate, requireFeature("employee.create")];
const canUpdateEmployees = [authenticate, requireFeature("employee.update")];
const canDeleteEmployees = [authenticate, requireFeature("employee.delete")];

router.get(
  "/employees",
  ...canViewEmployees,
  validateQuery(listEmployeeQuerySchema),
  ListEmployeeController,
);

router.post(
  "/employees",
  ...canCreateEmployees,
  validate(createEmployeePayloadSchema),
  CreateEmployeeController,
);


router.get(
  "/employees/:id",
  ...canViewEmployees,
  validateParams(idParamSchema),
  DetailEmployeeController,
);

router.patch(
  "/employees/:id",
  ...canUpdateEmployees,
  validateParams(idParamSchema),
  validate(updateEmployeeSchema),
  UpdateEmployeeController,
);

router.delete(
  "/employees/:id",
  ...canDeleteEmployees,
  validateParams(idParamSchema),
  DeleteEmployeeController,
);

router.post(
  "/employees/:id/photo",
  ...canUpdateEmployees,
  validateParams(idParamSchema),
  uploadSingleImage("photo"),
  UploadEmployeePhotoController,
);

router.delete(
  "/employees/:id/photo",
  ...canUpdateEmployees,
  validateParams(idParamSchema),
  DeleteEmployeePhotoController,
);

export default router;
