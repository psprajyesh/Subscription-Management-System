import { z } from "zod";
import { NOTIFICATION_TYPES } from "../config/constants.js";
import {
  createListQuerySchema,
  objectIdSchema,
  optionalBooleanQuery,
} from "./common.validators.js";

const nullableObjectIdSchema = z.union([z.null(), objectIdSchema]);

const notificationFields = {
  type: z.enum(NOTIFICATION_TYPES).optional(),
  title: z.string({ error: "Notification title is required" }).trim().min(1).max(160).optional(),
  message: z.string().trim().max(1000).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: nullableObjectIdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

export const createNotificationSchema = z
  .object({
    ...notificationFields,
    userId: objectIdSchema,
    type: z.enum(NOTIFICATION_TYPES),
    title: z.string({ error: "Notification title is required" }).trim().min(1).max(160),
  })
  .strict();

export const updateNotificationSchema = z
  .object(notificationFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const notificationListQuerySchema = createListQuerySchema({
  sortFields: ["createdAt", "type", "readAt"],
  filters: {
    type: z.enum(NOTIFICATION_TYPES).optional(),
    read: optionalBooleanQuery,
  },
});
