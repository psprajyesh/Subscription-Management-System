import { Router } from "express";
import * as customerController from "../controllers/customer.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createCustomerSchema,
  customerListQuerySchema,
  updateCustomerSchema,
} from "../validators/customer.validators.js";

const router = Router();

router.use(protect);

router.get(
  "/",
  validate(customerListQuerySchema, "query"),
  customerController.list,
);
router.get("/:id", validateObjectIdParam("id"), customerController.get);
router.post("/", validate(createCustomerSchema), customerController.create);
router.patch(
  "/:id",
  validateObjectIdParam("id"),
  validate(updateCustomerSchema),
  customerController.update,
);
router.delete(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  customerController.remove,
);
router.post(
  "/:id/restore",
  requireAdmin,
  validateObjectIdParam("id"),
  customerController.restore,
);

export default router;
