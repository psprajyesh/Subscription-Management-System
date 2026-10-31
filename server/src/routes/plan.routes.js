import { Router } from "express";
import * as planController from "../controllers/plan.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createPlanSchema,
  planListQuerySchema,
  updatePlanSchema,
} from "../validators/plan.validators.js";

const router = Router();

router.use(protect);

router.get("/", validate(planListQuerySchema, "query"), planController.list);
router.get("/:id", validateObjectIdParam("id"), planController.get);
router.post("/", requireAdmin, validate(createPlanSchema), planController.create);
router.patch(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  validate(updatePlanSchema),
  planController.update,
);
router.delete(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  planController.remove,
);
router.post(
  "/:id/restore",
  requireAdmin,
  validateObjectIdParam("id"),
  planController.restore,
);

export default router;
