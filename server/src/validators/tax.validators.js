import { z } from "zod";
import { TAX_STATUSES } from "../config/constants.js";
import { createListQuerySchema, optionalBooleanQuery } from "./common.validators.js";

const countrySchema = z
  .string()
  .trim()
  .length(2, "Country must be a two-letter code")
  .transform((value) => value.toUpperCase());

const taxFields = {
  name: z.string({ error: "Tax name is required" }).trim().min(2).max(120).optional(),
  country: countrySchema.optional(),
  state: z.string().trim().max(120).optional(),
  rateBasisPoints: z.coerce.number().int().min(0).max(10000).optional(),
  inclusive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(TAX_STATUSES).optional(),
  effectiveFrom: z.coerce.date().optional(),
};

export const createTaxSchema = z
  .object({
    ...taxFields,
    name: z.string({ error: "Tax name is required" }).trim().min(2).max(120),
    rateBasisPoints: z.coerce.number({ error: "Tax rate is required" }).int().min(0).max(10000),
  })
  .strict();

export const updateTaxSchema = z
  .object(taxFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const taxListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "name", "rateBasisPoints", "status", "country"],
  filters: {
    status: z.enum(TAX_STATUSES).optional(),
    country: countrySchema.optional(),
    isDefault: optionalBooleanQuery,
  },
});
