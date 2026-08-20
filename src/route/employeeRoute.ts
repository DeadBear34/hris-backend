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
  createEmployeeSchema,
  updateEmployeeSchema,
} from "../schema/employeeSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const bolehLihatKaryawan = [authenticate, requireFeature("employee.view_all")];
const bolehTambahKaryawan = [authenticate, requireFeature("employee.create")];
const bolehUbahKaryawan = [authenticate, requireFeature("employee.update")];
const bolehHapusKaryawan = [authenticate, requireFeature("employee.delete")];

router.get(
  "/employees",
  ...bolehLihatKaryawan,
  validateQuery(listEmployeeQuerySchema),
  ListEmployeeController,
);

router.post(
  "/employees",
  ...bolehTambahKaryawan,
  validate(createEmployeeSchema),
  CreateEmployeeController,
);

router.get(
  "/employees/:id",
  ...bolehLihatKaryawan,
  validateParams(idParamSchema),
  DetailEmployeeController,
);

router.patch(
  "/employees/:id",
  ...bolehUbahKaryawan,
  validateParams(idParamSchema),
  validate(updateEmployeeSchema),
  UpdateEmployeeController,
);

router.delete(
  "/employees/:id",
  ...bolehHapusKaryawan,
  validateParams(idParamSchema),
  DeleteEmployeeController,
);

router.post(
  "/employees/:id/photo",
  ...bolehUbahKaryawan,
  validateParams(idParamSchema),
  uploadSingleImage("photo"),
  UploadEmployeePhotoController,
);

router.delete(
  "/employees/:id/photo",
  ...bolehUbahKaryawan,
  validateParams(idParamSchema),
  DeleteEmployeePhotoController,
);

export default router;
