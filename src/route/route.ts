import { Router } from "express";
import { RegisterController, LoginController, MeController } from "../controller/userController.js";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema, registerSchema } from "../schema/authSchema.js";

const router = Router();

router.post("/auth/register", validate(registerSchema), RegisterController);
router.post("/auth/login",validate(loginSchema) ,LoginController);
router.get("/auth/me", authenticate, MeController);

export default router;