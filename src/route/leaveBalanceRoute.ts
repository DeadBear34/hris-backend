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

// Saldo cuti dan ledgernya
const router = Router();
const loggedIn = [authenticate];
const bolehLihatSemuaCuti = [authenticate, requireFeature("leave.view_all")];
const bolehSesuaikanSaldo = [
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
  ...bolehSesuaikanSaldo,
  validate(adjustBalanceSchema),
  AdjustLeaveBalanceController,
);

router.get(
  "/leave-balances/:id",
  ...bolehLihatSemuaCuti,
  validateParams(idParamSchema),
  validateQuery(balanceQuerySchema),
  EmployeeLeaveBalanceController,
);

export default router;
