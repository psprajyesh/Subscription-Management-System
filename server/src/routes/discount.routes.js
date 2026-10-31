import { Router } from "express";
import * as discountController from "../controllers/discount.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createDiscountSchema,
  discountListQuerySchema,
  updateDiscountSchema,
} from "../validators/discount.validators.js";

const router = Router();

router.use(protect);

router.get(
  "/",
  validate(discountListQuerySchema, "query"),
  discountController.list,
);
router.get("/:id", validateObjectIdParam("id"), discountController.get);
router.post(
  "/",
  requireAdmin,
  validate(createDiscountSchema),
  discountController.create,
);
router.patch(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  validate(updateDiscountSchema),
  discountController.update,
);
router.delete(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  discountController.remove,
);
router.post(
  "/:id/restore",
  requireAdmin,
  validateObjectIdParam("id"),
  discountController.restore,
);

export default router;
