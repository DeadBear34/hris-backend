import { Router } from "express";
import {
  ListWorkScheduleController,
  MyWorkScheduleController,
  DetailWorkScheduleController,
  CreateWorkScheduleController,
  UpdateWorkScheduleController,
  DeleteWorkScheduleController,
} from "../controller/workScheduleController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import { validate, validateParams } from "../middlewares/validate.js";
import {
  createWorkScheduleSchema,
  updateWorkScheduleSchema,
} from "../schema/workScheduleSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();

const loggedIn = [authenticate];
const canManageSchedule = [
  authenticate,
  requireFeature("organization.schedule"),
];

router.get("/work-schedules/me", ...loggedIn, MyWorkScheduleController);

router.get("/work-schedules", ...loggedIn, ListWorkScheduleController);

router.get(
  "/work-schedules/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailWorkScheduleController,
);

router.post(
  "/work-schedules",
  ...canManageSchedule,
  validate(createWorkScheduleSchema),
  CreateWorkScheduleController,
);

router.patch(
  "/work-schedules/:id",
  ...canManageSchedule,
  validateParams(idParamSchema),
  validate(updateWorkScheduleSchema),
  UpdateWorkScheduleController,
);

router.delete(
  "/work-schedules/:id",
  ...canManageSchedule,
  validateParams(idParamSchema),
  DeleteWorkScheduleController,
);

export default router;
