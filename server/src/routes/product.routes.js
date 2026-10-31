import { Router } from "express";
import * as productController from "../controllers/product.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from "../validators/product.validators.js";

const router = Router();

router.use(protect);

router.get(
  "/",
  validate(productListQuerySchema, "query"),
  productController.list,
);
router.get("/:id", validateObjectIdParam("id"), productController.get);
router.post(
  "/",
  requireAdmin,
  validate(createProductSchema),
  productController.create,
);
router.patch(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  validate(updateProductSchema),
  productController.update,
);
router.delete(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  productController.remove,
);
router.post(
  "/:id/restore",
  requireAdmin,
  validateObjectIdParam("id"),
  productController.restore,
);

export default router;
