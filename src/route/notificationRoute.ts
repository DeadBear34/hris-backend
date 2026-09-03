import { Router } from "express";
import {
  ListNotificationController,
  MarkNotificationReadController,
  MarkAllNotificationReadController,
} from "../controller/notificationController.js";
import { authenticate } from "../middlewares/auth.js";
import { validateQuery, validateParams } from "../middlewares/validate.js";
import { listNotificationQuerySchema } from "../schema/notificationSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();

// Tanpa requireFeature: notifikasi selalu milik diri sendiri, penyaringnya
// recipient_user_id, bukan izin fitur
const loggedIn = [authenticate];

router.get(
  "/notifications",
  ...loggedIn,
  validateQuery(listNotificationQuerySchema),
  ListNotificationController,
);

router.patch(
  "/notifications/read-all",
  ...loggedIn,
  MarkAllNotificationReadController,
);

router.patch(
  "/notifications/:id/read",
  ...loggedIn,
  validateParams(idParamSchema),
  MarkNotificationReadController,
);

export default router;
