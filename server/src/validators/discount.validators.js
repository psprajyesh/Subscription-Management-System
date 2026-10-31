import { z } from "zod";
import {
  DISCOUNT_DURATIONS,
  DISCOUNT_STATUSES,
  DISCOUNT_TYPES,
} from "../config/constants.js";
import { createListQuerySchema, objectIdSchema } from "./common.validators.js";

const discountFields = {
  code: z.string({ error: "Discount code is required" }).trim().min(2).max(40).optional(),
  type: z.enum(DISCOUNT_TYPES).optional(),
  value: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  duration: z.enum(DISCOUNT_DURATIONS).optional(),
  durationMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  maxRedemptions: z.coerce.number().int().min(1).max(1_000_000).nullable().optional(),
  minAmountMinor: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  appliesToProducts: z.array(objectIdSchema).max(100).optional(),
  appliesToPlans: z.array(objectIdSchema).max(100).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.union([z.null(), z.coerce.date()]).optional(),
  status: z.enum(DISCOUNT_STATUSES).optional(),
};

export const createDiscountSchema = z
  .object({
    ...discountFields,
    code: z.string({ error: "Discount code is required" }).trim().min(2).max(40),
    type: z.enum(DISCOUNT_TYPES),
    value: z.coerce.number({ error: "Discount value is required" }).int().min(0),
  })
  .strict()
  .refine((value) => value.type !== "percentage" || value.value <= 100, {
    message: "Percentage discounts cannot exceed 100",
    path: ["value"],
  })
  .refine(
    (value) => value.duration !== "repeating" || (value.durationMonths !== undefined && value.durationMonths !== null),
    {
      message: "durationMonths is required when duration is 'repeating'",
      path: ["durationMonths"],
    },
  )
  .refine(
    (value) => !value.validUntil || !value.validFrom || value.validUntil > value.validFrom,
    {
      message: "validUntil must be after validFrom",
      path: ["validUntil"],
    },
  );

export const updateDiscountSchema = z
  .object(discountFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .refine((value) => value.type !== "percentage" || value.value === undefined || value.value <= 100, {
    message: "Percentage discounts cannot exceed 100",
    path: ["value"],
  })
  .refine(
    (value) => !value.validUntil || !value.validFrom || value.validUntil > value.validFrom,
    {
      message: "validUntil must be after validFrom",
      path: ["validUntil"],
    },
  );

export const discountListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "code", "status", "validUntil", "timesRedeemed"],
  filters: {
    type: z.enum(DISCOUNT_TYPES).optional(),
    status: z.enum(DISCOUNT_STATUSES).optional(),
  },
});
