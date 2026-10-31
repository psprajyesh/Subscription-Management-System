import mongoose from "mongoose";
import { TAX_STATUSES } from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";
import { softDeletePlugin } from "./plugins/softDelete.js";

const taxSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Tax name is required"],
      trim: true,
      maxlength: [120, "Tax name must be at most 120 characters"],
    },
    country: {
      type: String,
      trim: true,
      uppercase: true,
      default: "IN",
      maxlength: 2,
    },
    state: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    // Basis points: 1800 = 18%.
    rateBasisPoints: {
      type: Number,
      required: [true, "Tax rate is required"],
      min: [0, "Tax rate cannot be negative"],
      max: [10000, "Tax rate cannot exceed 100%"],
      validate: integerValidator,
    },
    inclusive: {
      type: Boolean,
      default: false,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: TAX_STATUSES,
      default: "active",
    },
    effectiveFrom: {
      type: Date,
      default: () => new Date(),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  baseSchemaOptions,
);

taxSchema.plugin(softDeletePlugin);

taxSchema.index({ country: 1, state: 1 });
// Only one active default tax is allowed.
taxSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true, deletedAt: null } },
);

export const Tax = mongoose.models.Tax || mongoose.model("Tax", taxSchema);

export default Tax;
