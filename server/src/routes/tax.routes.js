import { Router } from "express";
import * as taxController from "../controllers/tax.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createTaxSchema,
  taxListQuerySchema,
  updateTaxSchema,
} from "../validators/tax.validators.js";

const router = Router();

router.use(protect);

router.get("/", validate(taxListQuerySchema, "query"), taxController.list);
router.get("/:id", validateObjectIdParam("id"), taxController.get);
router.post("/", requireAdmin, validate(createTaxSchema), taxController.create);
router.patch(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  validate(updateTaxSchema),
  taxController.update,
);
router.delete(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  taxController.remove,
);
router.post(
  "/:id/restore",
  requireAdmin,
  validateObjectIdParam("id"),
  taxController.restore,
);

export default router;
