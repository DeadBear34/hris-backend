// baru: rute /org/tree dan /employees/:id/line-manager
import { Router } from "express";
import {
  OrgTreeController,
  LineManagerController,
} from "../controller/orgController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import { validateParams } from "../middlewares/validate.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();

router.get(
  "/org/tree",
  authenticate,
  requireFeature("organization.manage"),
  OrgTreeController,
);

router.get(
  "/employees/:id/line-manager",
  authenticate,
  requireFeature("employee.view_all"),
  validateParams(idParamSchema),
  LineManagerController,
);

export default router;
