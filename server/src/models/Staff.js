import mongoose from "mongoose";
import { STAFF_STATUSES } from "../config/constants.js";
import { baseSchemaOptions } from "./schemaOptions.js";
import { softDeletePlugin } from "./plugins/softDelete.js";

const staffSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    title: {
      type: String,
      trim: true,
      default: "Team member",
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    permissions: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: STAFF_STATUSES,
      default: "invited",
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    joinedAt: {
      type: Date,
      default: null,
    },
  },
  baseSchemaOptions,
);

staffSchema.plugin(softDeletePlugin);

// One staff profile per user (1:1).
staffSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
staffSchema.index({ status: 1, createdAt: -1 });

export const Staff = mongoose.models.Staff || mongoose.model("Staff", staffSchema);

export default Staff;
