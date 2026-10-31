import mongoose from "mongoose";
import { BILLING_CYCLES, CURRENCIES, PLAN_STATUSES } from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";
import { softDeletePlugin } from "./plugins/softDelete.js";

const planSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      maxlength: [120, "Plan name must be at most 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
      required: [true, "Billing cycle is required"],
    },
    // Stored in paise (INR minor units) to avoid floating-point billing errors.
    priceMinor: {
      type: Number,
      required: [true, "Plan price is required"],
      min: [0, "Plan price cannot be negative"],
      validate: integerValidator,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },
    trialDays: {
      type: Number,
      min: [0, "Trial days cannot be negative"],
      max: [365, "Trial days cannot exceed 365"],
      default: 0,
      validate: integerValidator,
    },
    features: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: PLAN_STATUSES,
      default: "active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  baseSchemaOptions,
);

planSchema.plugin(softDeletePlugin);

planSchema.index(
  { product: 1, name: 1, billingCycle: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
planSchema.index({ product: 1, status: 1 });
planSchema.index({ billingCycle: 1, priceMinor: 1 });

export const Plan = mongoose.models.Plan || mongoose.model("Plan", planSchema);

export default Plan;
