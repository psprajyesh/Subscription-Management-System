import { Router } from "express";
import authRoutes from "./auth.routes.js";
import customerRoutes from "./customer.routes.js";
import discountRoutes from "./discount.routes.js";
import healthRoutes from "./health.routes.js";
import notificationRoutes from "./notification.routes.js";
import planRoutes from "./plan.routes.js";
import productRoutes from "./product.routes.js";
import settingsRoutes from "./settings.routes.js";
import staffRoutes from "./staff.routes.js";
import taxRoutes from "./tax.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/customers", customerRoutes);
router.use("/products", productRoutes);
router.use("/plans", planRoutes);
router.use("/discounts", discountRoutes);
router.use("/taxes", taxRoutes);
router.use("/staff", staffRoutes);
router.use("/settings", settingsRoutes);
router.use("/notifications", notificationRoutes);

export default router;
