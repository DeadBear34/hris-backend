import { Router } from "express";
import { RegisterController, LoginController, MeController } from "../controller/userController.js";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

router.post("/auth/register", RegisterController);
router.post("/auth/login", LoginController);
router.get("/auth/me", authenticate, MeController);

export default router;