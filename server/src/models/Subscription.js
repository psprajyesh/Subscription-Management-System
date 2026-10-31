import mongoose from "mongoose";
import {
  BLOCKING_SUBSCRIPTION_STATUSES,
  CURRENCIES,
  SUBSCRIPTION_STATUSES,
} from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";

const subscriptionSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: [true, "Plan is required"],
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: "active",
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, "Quantity must be at least 1"],
      validate: integerValidator,
    },
    // Price snapshot in paise at subscription time (immune to later plan edits).
    priceMinor: {
      type: Number,
      required: [true, "Subscription price is required"],
      min: [0, "Subscription price cannot be negative"],
      validate: integerValidator,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },
    discount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discount",
      default: null,
    },
    discountCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    taxRateBasisPoints: {
      type: Number,
      default: 1800,
      min: [0, "Tax rate cannot be negative"],
      max: [10000, "Tax rate cannot exceed 100%"],
      validate: integerValidator,
    },
    startedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    trialEndsAt: {
      type: Date,
      default: null,
    },
    currentPeriodStart: {
      type: Date,
      required: [true, "Current period start is required"],
    },
    currentPeriodEnd: {
      type: Date,
      required: [true, "Current period end is required"],
    },
    nextBillingAt: {
      type: Date,
      required: [true, "Next billing date is required"],
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    canceledAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    resumedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  baseSchemaOptions,
);

subscriptionSchema.pre("validate", function validatePeriod() {
  if (this.currentPeriodStart && this.currentPeriodEnd && this.currentPeriodEnd <= this.currentPeriodStart) {
    throw new Error("currentPeriodEnd must be after currentPeriodStart");
  }

  if (this.trialEndsAt && this.startedAt && this.trialEndsAt < this.startedAt) {
    throw new Error("trialEndsAt cannot be before startedAt");
  }
});

/**
 * Prevent duplicate live subscriptions for the same customer/plan pair.
 * Canceled, expired and past-due subscriptions no longer block a new one.
 */
subscriptionSchema.index(
  { customer: 1, plan: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: BLOCKING_SUBSCRIPTION_STATUSES } },
  },
);
subscriptionSchema.index({ customer: 1, status: 1 });
subscriptionSchema.index({ status: 1, nextBillingAt: 1 });
subscriptionSchema.index({ plan: 1 });
subscriptionSchema.index({ createdAt: -1 });

export const Subscription =
  mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
