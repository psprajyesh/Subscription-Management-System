import { Router } from "express";
import * as staffController from "../controllers/staff.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createStaffSchema,
  staffListQuerySchema,
  updateStaffSchema,
} from "../validators/staff.validators.js";

const router = Router();

router.use(protect);

router.get("/me", staffController.me);
router.get(
  "/",
  requireAdmin,
  validate(staffListQuerySchema, "query"),
  staffController.list,
);
router.get(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  staffController.get,
);
router.post(
  "/",
  requireAdmin,
  validate(createStaffSchema),
  staffController.create,
);
router.patch(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  validate(updateStaffSchema),
  staffController.update,
);
router.delete(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  staffController.remove,
);
router.post(
  "/:id/restore",
  requireAdmin,
  validateObjectIdParam("id"),
  staffController.restore,
);

export default router;
