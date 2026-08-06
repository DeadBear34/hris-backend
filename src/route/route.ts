import { Router } from "express";
import { RegisterController, LoginController, MeController } from "../controller/userController.js";
import { authenticate, authorize } from "../middlewares/auth.js";
import { validate, validateQuery } from "../middlewares/validate.js";
import { loginSchema, registerSchema } from "../schema/authSchema.js";
import { ListEmployeeController } from "../controller/employeeController.js";
import { ListDepartmentController, ListPositionController } from "../controller/referenceController.js";
import { listEmployeeQuerySchema } from "../schema/employeeSchema.js";

const router = Router();

router.post("/auth/register", validate(registerSchema), RegisterController);
router.post("/auth/login",validate(loginSchema) ,LoginController);
router.get("/auth/me", authenticate, MeController);


router.get(
  "/employees",
  authenticate,
  authorize("hr", "admin"),
  validateQuery(listEmployeeQuerySchema),
  ListEmployeeController,
);

router.get("/departments", authenticate, ListDepartmentController);
router.get("/positions", authenticate, ListPositionController);


export default router;