import { z } from "zod";
import {
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
} from "../config/constants.js";
import {
  createListQuerySchema,
  objectIdSchema,
  optionalBooleanQuery,
} from "./common.validators.js";

export const createSubscriptionSchema = z
  .object({
    customer: objectIdSchema,
    plan: objectIdSchema,
    quantity: z.coerce.number().int().min(1).max(1000).optional(),
    discountCode: z.string().trim().min(1).max(40).optional(),
    startTrial: z.boolean().optional().default(false),
    startedAt: z.coerce.date().optional(),
  })
  .strict();

export const changeSubscriptionPlanSchema = z
  .object({
    plan: objectIdSchema,
    quantity: z.coerce.number().int().min(1).max(1000).optional(),
  })
  .strict();

export const cancelSubscriptionSchema = z.preprocess(
  (value) => value ?? {},
  z
    .object({
      atPeriodEnd: z.boolean().optional().default(false),
      reason: z.string().trim().max(500).optional(),
    })
    .strict(),
);

/** Lifecycle actions without a payload reject unknown fields. */
export const emptySubscriptionActionSchema = z.preprocess(
  (value) => value ?? {},
  z.object({}).strict(),
);

export const subscriptionListQuerySchema = createListQuerySchema({
  sortFields: [
    "createdAt",
    "updatedAt",
    "startedAt",
    "currentPeriodStart",
    "currentPeriodEnd",
    "nextBillingAt",
    "status",
    "priceMinor",
  ],
  filters: {
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
    customer: objectIdSchema.optional(),
    plan: objectIdSchema.optional(),
    billingCycle: z.enum(BILLING_CYCLES).optional(),
    cancelAtPeriodEnd: optionalBooleanQuery,
  },
});

export const subscriptionMetricsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.from || !value.to || value.from.getTime() <= value.to.getTime(),
    { message: "from must be before or equal to to", path: ["from"] },
  );
