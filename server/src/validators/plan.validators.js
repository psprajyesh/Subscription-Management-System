import { z } from "zod";
import { BILLING_CYCLES, PLAN_STATUSES } from "../config/constants.js";
import { createListQuerySchema, objectIdSchema } from "./common.validators.js";

const planFields = {
  product: objectIdSchema.optional(),
  name: z.string({ error: "Plan name is required" }).trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  priceMinor: z.coerce
    .number()
    .int()
    .min(0, "Plan price cannot be negative")
    .max(1_000_000_000_000)
    .optional(),
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  status: z.enum(PLAN_STATUSES).optional(),
};

export const createPlanSchema = z
  .object({
    ...planFields,
    product: objectIdSchema,
    name: z.string({ error: "Plan name is required" }).trim().min(2).max(120),
    billingCycle: z.enum(BILLING_CYCLES),
    priceMinor: z.coerce
      .number({ error: "Plan price is required" })
      .int()
      .min(0, "Plan price cannot be negative")
      .max(1_000_000_000_000),
  })
  .strict();

export const updatePlanSchema = z
  .object(planFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const planListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "name", "priceMinor", "billingCycle", "status"],
  filters: {
    product: objectIdSchema.optional(),
    billingCycle: z.enum(BILLING_CYCLES).optional(),
    status: z.enum(PLAN_STATUSES).optional(),
  },
});
