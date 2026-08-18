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

// Kontrol fitur berbasis jabatan
const router = Router();
const loggedIn = [authenticate];

/**
 * Pengelolaan fitur sengaja dijaga role admin, bukan oleh fitur.
 *
 * Kalau dijaga fitur, pemegangnya dapat memberikan fitur pengelolaan kepada
 * jabatannya sendiri lalu memperluas kewenangannya tanpa batas. Menguncinya
 * pada role membuat batas kewenangan hanya dapat diubah dari luar sistem.
 */
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

// Setiap pengguna berhak mengetahui kemampuannya sendiri
router.get("/me/features", ...loggedIn, MyFeatureController);

export default router;
