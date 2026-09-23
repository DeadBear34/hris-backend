import { Router } from "express";
import { ListActivityLogController } from "../controller/activityLogController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import { validateQuery } from "../middlewares/validate.js";
import { listActivityLogQuerySchema } from "../schema/activityLogSchema.js";

const router = Router();

router.get(
  "/activity-logs",
  authenticate,
  requireFeature("system.view_log"),
  validateQuery(listActivityLogQuerySchema),
  ListActivityLogController,
);

export default router;
