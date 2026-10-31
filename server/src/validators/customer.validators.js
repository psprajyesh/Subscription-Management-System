import { z } from "zod";
import { CUSTOMER_STATUSES } from "../config/constants.js";
import { createListQuerySchema, emailSchema } from "./common.validators.js";

const billingAddressSchema = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    country: z
      .string()
      .trim()
      .length(2, "Country must be a two-letter code")
      .transform((value) => value.toUpperCase())
      .optional(),
    postalCode: z.string().trim().max(20).optional(),
  })
  .strict();

const customerFields = {
  name: z.string({ error: "Customer name is required" }).trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(30).optional(),
  company: z.string().trim().max(120).optional(),
  billingAddress: billingAddressSchema.optional(),
  gstin: z
    .string()
    .trim()
    .max(20)
    .transform((value) => value.toUpperCase())
    .optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  notes: z.string().trim().max(2000).optional(),
};

export const createCustomerSchema = z
  .object({
    ...customerFields,
    name: z.string({ error: "Customer name is required" }).trim().min(2).max(120),
    email: emailSchema,
  })
  .strict();

export const updateCustomerSchema = z
  .object(customerFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const customerListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "name", "email", "company", "status"],
  filters: {
    status: z.enum(CUSTOMER_STATUSES).optional(),
  },
});
