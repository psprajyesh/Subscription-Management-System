import mongoose from "mongoose";
import { NOTIFICATION_TYPES } from "../config/constants.js";
import { baseSchemaOptions } from "./schemaOptions.js";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: [true, "Notification type is required"],
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    entityType: {
      type: String,
      trim: true,
      default: "",
      maxlength: 60,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  baseSchemaOptions,
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

export default Notification;
