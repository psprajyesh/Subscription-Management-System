import { Router } from "express";
import * as settingsController from "../controllers/settings.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { updateSettingsSchema } from "../validators/settings.validators.js";

const router = Router();

router.use(protect);

router.get("/", settingsController.get);
router.patch(
  "/",
  requireAdmin,
  validate(updateSettingsSchema),
  settingsController.update,
);

export default router;
