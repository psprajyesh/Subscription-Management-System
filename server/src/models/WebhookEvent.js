import mongoose from "mongoose";
import { baseSchemaOptions } from "./schemaOptions.js";

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: [true, "Webhook event id is required"],
      unique: true,
      trim: true,
    },
    provider: {
      type: String,
      trim: true,
      default: "razorpay",
    },
    type: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    status: {
      type: String,
      enum: ["received", "processed", "failed"],
      default: "received",
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  baseSchemaOptions,
);

webhookEventSchema.index({ provider: 1, createdAt: -1 });
// Keep processed webhook ids for 180 days for idempotency/audit.
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const WebhookEvent =
  mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", webhookEventSchema);

export default WebhookEvent;
