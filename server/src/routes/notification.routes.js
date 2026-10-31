import { Router } from "express";
import * as notificationController from "../controllers/notification.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  createNotificationSchema,
  notificationListQuerySchema,
  updateNotificationSchema,
} from "../validators/notification.validators.js";

const router = Router();

router.use(protect);

router.get(
  "/",
  validate(notificationListQuerySchema, "query"),
  notificationController.list,
);
router.get("/unread-count", notificationController.unreadCount);
router.patch("/read-all", notificationController.markAllRead);
router.post(
  "/",
  requireAdmin,
  validate(createNotificationSchema),
  notificationController.create,
);
router.get("/:id", validateObjectIdParam("id"), notificationController.get);
router.patch(
  "/:id",
  requireAdmin,
  validateObjectIdParam("id"),
  validate(updateNotificationSchema),
  notificationController.update,
);
router.patch(
  "/:id/read",
  validateObjectIdParam("id"),
  notificationController.markRead,
);
router.patch(
  "/:id/unread",
  validateObjectIdParam("id"),
  notificationController.markUnread,
);
router.delete(
  "/:id",
  validateObjectIdParam("id"),
  notificationController.remove,
);

export default router;
