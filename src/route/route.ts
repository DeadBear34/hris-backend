import { Router } from "express";
import { register, login, me } from "../controller/userController.js";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", authenticate, me);

export default router;