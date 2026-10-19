import { Router } from "express";
import authRoute from "./authRoute.js";
import userAccountRoute from "./userAccountRoute.js";
import employeeRoute from "./employeeRoute.js";
import departmentRoute from "./departmentRoute.js";
import positionRoute from "./positionRoute.js";
import orgRoute from "./orgRoute.js";
import featureRoute from "./featureRoute.js";
import holidayRoute from "./holidayRoute.js";
import leaveTypeRoute from "./leaveTypeRoute.js";
import leaveRequestRoute from "./leaveRequestRoute.js";
import leaveBalanceRoute from "./leaveBalanceRoute.js";
import workScheduleRoute from "./workScheduleRoute.js";
import attendanceRoute from "./attendanceRoute.js";
import notificationRoute from "./notificationRoute.js";
import activityLogRoute from "./activityLogRoute.js";
import docsRoute from "./docsRoute.js";
import { apiRateLimit } from "../middlewares/rateLimit.js";
import { createTryItOutGuard } from "../middlewares/apiDocsGuard.js";
import { registerApiRouter } from "../docs/registry.js";
import { env } from "../config/env.js";

const router = Router();

// Dipasang paling depan supaya ikut menghitung permintaan ke route yang
// tidak ada, misalnya pemindaian endpoint
router.use(apiRateLimit);

// Di production, percobaan dari halaman dokumentasi API hanya boleh membaca
router.use(createTryItOutGuard(env.NODE_ENV === "production"));

router.use(authRoute);
router.use(userAccountRoute);

router.use(employeeRoute);
router.use(departmentRoute);
router.use(positionRoute);
// baru: rute struktur organisasi
router.use(orgRoute);
router.use(featureRoute);

router.use(holidayRoute);
router.use(leaveTypeRoute);
router.use(leaveRequestRoute);
router.use(leaveBalanceRoute);

router.use(workScheduleRoute);
router.use(attendanceRoute);
router.use(notificationRoute);
router.use(activityLogRoute);
router.use(docsRoute);

// Didaftarkan untuk pembangkit dokumentasi OpenAPI
registerApiRouter(router);

export default router;
