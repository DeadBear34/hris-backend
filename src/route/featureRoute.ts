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
import {
  ListAccessProfileController,
  DetailAccessProfileController,
  CreateAccessProfileController,
  UpdateAccessProfileController,
  DeleteAccessProfileController,
  AssignAccessProfileController,
} from "../controller/accessProfileController.js";
import {
  createAccessProfileSchema,
  updateAccessProfileSchema,
  assignAccessProfileSchema,
} from "../schema/accessProfileSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];

// Sengaja dijaga role, bukan fitur. Kalau dijaga fitur, pemegangnya dapat
// memberi fitur apa pun ke jabatan lain lalu memindahkan dirinya ke sana
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

// Paket akses: kumpulan fitur yang dipasang ke jabatan. Dijaga role admin
// dengan alasan yang sama seperti pengaturan fitur di atas
router.get("/access-profiles", ...adminOnly, ListAccessProfileController);

router.get(
  "/access-profiles/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DetailAccessProfileController,
);

router.post(
  "/access-profiles",
  ...adminOnly,
  validate(createAccessProfileSchema),
  CreateAccessProfileController,
);

router.patch(
  "/access-profiles/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(updateAccessProfileSchema),
  UpdateAccessProfileController,
);

router.delete(
  "/access-profiles/:id",
  ...adminOnly,
  validateParams(idParamSchema),
  DeleteAccessProfileController,
);

router.put(
  "/positions/:id/access-profile",
  ...adminOnly,
  validateParams(idParamSchema),
  validate(assignAccessProfileSchema),
  AssignAccessProfileController,
);

router.get("/me/features", ...loggedIn, MyFeatureController);

export default router;
