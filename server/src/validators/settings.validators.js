import { z } from "zod";
import { CURRENCIES } from "../config/constants.js";
import { objectIdSchema } from "./common.validators.js";

const settingsFields = {
  workspaceName: z.string().trim().min(2).max(120).optional(),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  invoicePrefix: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((value) => value.toUpperCase())
    .optional(),
  invoiceDueDays: z.coerce.number().int().min(0).max(365).optional(),
  defaultTax: z.union([z.null(), objectIdSchema]).optional(),
  supportEmail: z
    .string()
    .trim()
    .max(160)
    .refine(
      (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Support email is invalid",
    )
    .transform((value) => value.toLowerCase())
    .optional(),
};

export const updateSettingsSchema = z
  .object(settingsFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
