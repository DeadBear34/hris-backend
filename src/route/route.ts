import { Router } from "express";
import authRoute from "./authRoute.js";
import userAccountRoute from "./userAccountRoute.js";
import employeeRoute from "./employeeRoute.js";
import departmentRoute from "./departmentRoute.js";
import positionRoute from "./positionRoute.js";
import featureRoute from "./featureRoute.js";
import holidayRoute from "./holidayRoute.js";
import leaveTypeRoute from "./leaveTypeRoute.js";
import leaveRequestRoute from "./leaveRequestRoute.js";
import leaveBalanceRoute from "./leaveBalanceRoute.js";
import workScheduleRoute from "./workScheduleRoute.js";
import attendanceRoute from "./attendanceRoute.js";

const router = Router();

router.use(authRoute);
router.use(userAccountRoute);

router.use(employeeRoute);
router.use(departmentRoute);
router.use(positionRoute);
router.use(featureRoute);

router.use(holidayRoute);
router.use(leaveTypeRoute);
router.use(leaveRequestRoute);
router.use(leaveBalanceRoute);

router.use(workScheduleRoute);
router.use(attendanceRoute);

export default router;
