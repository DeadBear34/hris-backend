import { Router } from "express";
import {
  OrgTreeController,
  LineManagerController,
  PositionLineManagerController,
} from "../controller/orgController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import { validateParams, validateQuery } from "../middlewares/validate.js";
import { idParamSchema } from "../schema/commonSchema.js";
import { positionLineManagerQuerySchema } from "../schema/positionSchema.js";

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

router.get(
  "/positions/:id/line-manager",
  authenticate,
  requireFeature("employee.view_all"),
  validateParams(idParamSchema),
  validateQuery(positionLineManagerQuerySchema),
  PositionLineManagerController,
);

export default router;
