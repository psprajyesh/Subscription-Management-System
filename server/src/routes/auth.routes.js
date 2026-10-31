import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "../validators/auth.validators.js";

const router = Router();

// Bootstrap only: succeeds just while the database has no users.
router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);
router.patch(
  "/password",
  protect,
  validate(changePasswordSchema),
  authController.changePassword,
);

export default router;
