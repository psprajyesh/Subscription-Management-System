import { Router } from "express";
import * as subscriptionController from "../controllers/subscription.controller.js";
import { protect } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  cancelSubscriptionSchema,
  changeSubscriptionPlanSchema,
  createSubscriptionSchema,
  emptySubscriptionActionSchema,
  subscriptionListQuerySchema,
  subscriptionMetricsQuerySchema,
} from "../validators/subscription.validators.js";

const router = Router();

router.use(protect);

router.get(
  "/",
  validate(subscriptionListQuerySchema, "query"),
  subscriptionController.list,
);
router.get(
  "/metrics",
  validate(subscriptionMetricsQuerySchema, "query"),
  subscriptionController.metrics,
);
router.get(
  "/past-due",
  validate(subscriptionListQuerySchema, "query"),
  subscriptionController.listPastDue,
);

router.post(
  "/",
  validate(createSubscriptionSchema),
  subscriptionController.create,
);

router.get("/:id", validateObjectIdParam("id"), subscriptionController.get);
router.post(
  "/:id/trial/activate",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.trialActivate,
);
router.post(
  "/:id/activate",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.trialActivate,
);
router.post(
  "/:id/pause",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.pause,
);
router.post(
  "/:id/resume",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.resume,
);
router.post(
  "/:id/cancel",
  validateObjectIdParam("id"),
  validate(cancelSubscriptionSchema),
  subscriptionController.cancel,
);
router.post(
  "/:id/renew",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.renew,
);
router.post(
  "/:id/expire",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.expire,
);
router.post(
  "/:id/past-due",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.pastDue,
);
router.post(
  "/:id/mark-past-due",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.pastDue,
);
router.post(
  "/:id/reactivate",
  validateObjectIdParam("id"),
  validate(emptySubscriptionActionSchema),
  subscriptionController.reactivate,
);
router.post(
  "/:id/upgrade",
  validateObjectIdParam("id"),
  validate(changeSubscriptionPlanSchema),
  subscriptionController.upgrade,
);
router.post(
  "/:id/downgrade",
  validateObjectIdParam("id"),
  validate(changeSubscriptionPlanSchema),
  subscriptionController.downgrade,
);

export default router;
