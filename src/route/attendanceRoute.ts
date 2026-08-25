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

const bolehLihatTim = [authenticate, requireFeature("attendance.view_team")];
const bolehLihatSemua = [authenticate, requireFeature("attendance.view_all")];
const bolehKoreksi = [authenticate, requireFeature("attendance.correct")];
const bolehLaporan = [authenticate, requireFeature("attendance.report")];

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
  ...bolehLihatTim,
  validateQuery(listAttendanceQuerySchema),
  TeamAttendanceController,
);

router.get(
  "/attendances/report",
  ...bolehLaporan,
  validateQuery(reportQuerySchema),
  ReportAttendanceController,
);

router.get(
  "/attendances/events",
  ...bolehLaporan,
  validateQuery(eventLogQuerySchema),
  EventLogController,
);

router.get(
  "/attendances/offline-log",
  ...bolehLaporan,
  validateQuery(offlineLogQuerySchema),
  OfflineLogController,
);

router.get(
  "/attendances",
  ...bolehLihatSemua,
  validateQuery(listAttendanceQuerySchema),
  ListAttendanceController,
);

router.patch(
  "/attendances/:id/correct",
  ...bolehKoreksi,
  validateParams(idParamSchema),
  validate(correctAttendanceSchema),
  CorrectAttendanceController,
);

export default router;
