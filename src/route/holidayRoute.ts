import { Router } from "express";
import {
  ListHolidayController,
  DetailHolidayController,
  CreateHolidayController,
  UpdateHolidayController,
  DeleteHolidayController,
} from "../controller/holidayController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  listHolidayQuerySchema,
  createHolidaySchema,
  updateHolidaySchema,
} from "../schema/holidaySchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const canManageHolidays = [
  authenticate,
  requireFeature("organization.holiday"),
];

router.get(
  "/holidays",
  ...loggedIn,
  validateQuery(listHolidayQuerySchema),
  ListHolidayController,
);

router.get(
  "/holidays/:id",
  ...loggedIn,
  validateParams(idParamSchema),
  DetailHolidayController,
);

router.post(
  "/holidays",
  ...canManageHolidays,
  validate(createHolidaySchema),
  CreateHolidayController,
);

router.patch(
  "/holidays/:id",
  ...canManageHolidays,
  validateParams(idParamSchema),
  validate(updateHolidaySchema),
  UpdateHolidayController,
);

router.delete(
  "/holidays/:id",
  ...canManageHolidays,
  validateParams(idParamSchema),
  DeleteHolidayController,
);

export default router;
