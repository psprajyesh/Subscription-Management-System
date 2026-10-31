import mongoose from "mongoose";
import { baseSchemaOptions } from "./schemaOptions.js";

const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revocationReason: {
      type: String,
      enum: [
        "logout",
        "rotated",
        "reuse",
        "password_change",
        "expired",
        "account_inactive",
        "account_removed",
        "token_version_changed",
      ],
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    replacedByHash: {
      type: String,
      default: null,
      select: false,
    },
    createdByIp: {
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

refreshTokenSchema.index({ user: 1, revokedAt: 1 });
// MongoDB removes expired tokens automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.tokenHash;
    delete ret.replacedByHash;
    return ret;
  },
});

export const RefreshToken =
  mongoose.models.RefreshToken || mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
