import { Router } from "express";
import {
  ListDepartmentController,
  DetailDepartmentController,
  CreateDepartmentController,
  UpdateDepartmentController,
  DeleteDepartmentController,
} from "../controller/departmentController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "../schema/departmentSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

// Departemen
const router = Router();
const loggedIn = [authenticate];
const bolehKelolaOrganisasi = [
  authenticate,
  requireFeature("organization.manage"),
];

router.get("/departments", ...loggedIn, ListDepartmentController);

router.get(
  "/departments/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailDepartmentController,
);

router.post(
  "/departments",
  ...bolehKelolaOrganisasi,
  validate(createDepartmentSchema),
  CreateDepartmentController,
);

router.patch(
  "/departments/:id",
  ...bolehKelolaOrganisasi,
  validateParams(idParamSchema),
  validate(updateDepartmentSchema),
  UpdateDepartmentController,
);

router.delete(
  "/departments/:id",
  ...bolehKelolaOrganisasi,
  validateParams(idParamSchema),
  DeleteDepartmentController,
);

export default router;
