import { Router } from "express";
import {
  ListFeatureCatalogController,
  PositionFeatureController,
  ReplacePositionFeatureController,
  FeatureMatrixController,
  MyFeatureController,
} from "../controller/featureController.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate, validateParams } from "../middlewares/validate.js";
import { replacePositionFeaturesSchema } from "../schema/featureSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];

const adminOnly = [authenticate, authorize("admin")];

router.get("/features", ...adminOnly, ListFeatureCatalogController);

router.get("/features/matrix", ...adminOnly, FeatureMatrixController);

router.get(
  "/positions/:id/features",
  ...adminOnly,
  validateParams(idParamSchema),
  PositionFeatureController,
);

router.put(
  "/positions/:id/features",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(replacePositionFeaturesSchema),
  ReplacePositionFeatureController,
);

router.get("/me/features", ...loggedIn, MyFeatureController);

export default router;
