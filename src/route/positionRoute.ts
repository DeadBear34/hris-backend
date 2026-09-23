import { Router } from "express";
import {
  ListPositionController,
  DetailPositionController,
  CreatePositionController,
  UpdatePositionController,
  DeletePositionController,
} from "../controller/positionController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  createPositionSchema,
  updatePositionSchema,
} from "../schema/positionSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const canManageOrganization = [
  authenticate,
  requireFeature("organization.manage"),
];

router.get("/positions", ...loggedIn, ListPositionController);

router.get(
  "/positions/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailPositionController,
);

router.post(
  "/positions",
  ...canManageOrganization,
  validate(createPositionSchema),
  CreatePositionController,
);

router.patch(
  "/positions/:id",
  ...canManageOrganization,
  validateParams(idParamSchema),
  validate(updatePositionSchema),
  UpdatePositionController,
);

router.delete(
  "/positions/:id",
  ...canManageOrganization,
  validateParams(idParamSchema),
  DeletePositionController,
);

export default router;
