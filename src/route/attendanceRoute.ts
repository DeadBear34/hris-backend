import { Router } from "express";
import {
  CheckInController,
  CheckOutController,
  TodayAttendanceController,
  MyAttendanceController,
  TeamAttendanceController,
  ListAttendanceController,
  ReportAttendanceController,
  CorrectAttendanceController,
  CloseDayController,
  OfflineLogController,
  EventLogController,
} from "../controller/attendanceController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  checkInSchema,
  checkOutSchema,
  historyQuerySchema,
  listAttendanceQuerySchema,
  reportQuerySchema,
  correctAttendanceSchema,
  closeDayQuerySchema,
  offlineLogQuerySchema,
  eventLogQuerySchema,
} from "../schema/attendanceSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();

const loggedIn = [authenticate];

const canViewTeam = [authenticate, requireFeature("attendance.view_team")];
const canViewAll = [authenticate, requireFeature("attendance.view_all")];
const canCorrect = [authenticate, requireFeature("attendance.correct")];
const canViewReport = [authenticate, requireFeature("attendance.report")];

router.post(
  "/attendances/close-day",
  validateQuery(closeDayQuerySchema),
  CloseDayController,
);

router.post(
  "/attendances/check-in",
  ...loggedIn,
  validate(checkInSchema),
  CheckInController,
);

router.post(
  "/attendances/check-out",
  ...loggedIn,
  validate(checkOutSchema),
  CheckOutController,
);

router.get("/attendances/today", ...loggedIn, TodayAttendanceController);

router.get(
  "/attendances/me",
  ...loggedIn,
  validateQuery(historyQuerySchema),
  MyAttendanceController,
);

router.get(
  "/attendances/team",
  ...canViewTeam,
  validateQuery(listAttendanceQuerySchema),
  TeamAttendanceController,
);

router.get(
  "/attendances/report",
  ...canViewReport,
  validateQuery(reportQuerySchema),
  ReportAttendanceController,
);

router.get(
  "/attendances/events",
  ...canViewReport,
  validateQuery(eventLogQuerySchema),
  EventLogController,
);

router.get(
  "/attendances/offline-log",
  ...canViewReport,
  validateQuery(offlineLogQuerySchema),
  OfflineLogController,
);

router.get(
  "/attendances",
  ...canViewAll,
  validateQuery(listAttendanceQuerySchema),
  ListAttendanceController,
);

router.patch(
  "/attendances/:id/correct",
  ...canCorrect,
  validateParams(idParamSchema),
  validate(correctAttendanceSchema),
  CorrectAttendanceController,
);

export default router;
