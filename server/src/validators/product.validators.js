import { z } from "zod";
import { PRODUCT_STATUSES } from "../config/constants.js";
import { createListQuerySchema } from "./common.validators.js";

const productFields = {
  name: z.string({ error: "Product name is required" }).trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
};

export const createProductSchema = z
  .object({
    ...productFields,
    name: z.string({ error: "Product name is required" }).trim().min(2).max(120),
  })
  .strict();

export const updateProductSchema = z
  .object(productFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const productListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "name", "status"],
  filters: {
    status: z.enum(PRODUCT_STATUSES).optional(),
  },
});
