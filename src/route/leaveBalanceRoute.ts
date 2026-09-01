import { Router } from "express";
import {
  MyLeaveBalanceController,
  EmployeeLeaveBalanceController,
  MyLeaveLedgerController,
  AdjustLeaveBalanceController,
} from "../controller/leaveBalanceController.js";
import { authenticate } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/feature.js";
import {
  validate,
  validateQuery,
  validateParams,
} from "../middlewares/validate.js";
import {
  balanceQuerySchema,
  listLedgerQuerySchema,
  adjustBalanceSchema,
} from "../schema/leaveBalanceSchema.js";
import { idParamSchema } from "../schema/commonSchema.js";

const router = Router();
const loggedIn = [authenticate];
const canViewAllLeave = [authenticate, requireFeature("leave.view_all")];
const canAdjustBalance = [
  authenticate,
  requireFeature("leave.adjust_balance"),
];

router.get(
  "/leave-balances/me",
  ...loggedIn,
  validateQuery(balanceQuerySchema),
  MyLeaveBalanceController,
);

router.get(
  "/leave-balances/me/ledger",
  ...loggedIn,
  validateQuery(listLedgerQuerySchema),
  MyLeaveLedgerController,
);

router.post(
  "/leave-balances/adjustments",
  ...canAdjustBalance,
  validate(adjustBalanceSchema),
  AdjustLeaveBalanceController,
);

router.get(
  "/leave-balances/:id",
  ...canViewAllLeave,
  validateParams(idParamSchema),
  validateQuery(balanceQuerySchema),
  EmployeeLeaveBalanceController,
);

export default router;
