import { Router } from "express";
import { OpenApiDocumentController } from "../controller/docsController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";

const router = Router();

// Dokumentasi API memetakan seluruh endpoint, jadi tidak dibuka untuk publik.
// Hanya pemegang system.view_api_docs (dan admin) yang boleh membacanya
router.get(
  "/docs/openapi.json",
  authenticate,
  requireFeature("system.view_api_docs"),
  OpenApiDocumentController,
);

export default router;
