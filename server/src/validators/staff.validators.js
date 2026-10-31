import { z } from "zod";
import { STAFF_STATUSES } from "../config/constants.js";
import {
  createListQuerySchema,
  emailSchema,
  passwordSchema,
} from "./common.validators.js";

const staffFields = {
  name: z.string({ error: "Staff name is required" }).trim().min(2).max(80).optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  permissions: z
    .array(z.string().trim().min(1).max(80))
    .max(50)
    .refine((values) => new Set(values).size === values.length, {
      message: "Permissions must be unique",
    })
    .optional(),
  status: z.enum(STAFF_STATUSES).optional(),
};

export const createStaffSchema = z
  .object({
    ...staffFields,
    name: z.string({ error: "Staff name is required" }).trim().min(2).max(80),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const updateStaffSchema = z
  .object(staffFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const staffListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "title", "status", "joinedAt"],
  filters: {
    status: z.enum(STAFF_STATUSES).optional(),
  },
});
