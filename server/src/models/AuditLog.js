import mongoose from "mongoose";
import { baseSchemaOptions } from "./schemaOptions.js";

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    action: {
      type: String,
      required: [true, "Audit action is required"],
      trim: true,
      maxlength: 120,
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
    diff: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      trim: true,
      default: "",
      maxlength: 60,
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
      maxlength: 300,
    },
  },
  baseSchemaOptions,
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
// Retain audit history for 180 days.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
