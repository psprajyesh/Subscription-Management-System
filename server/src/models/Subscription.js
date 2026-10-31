import mongoose from "mongoose";
import {
  BILLING_CYCLES,
  BLOCKING_SUBSCRIPTION_STATUSES,
  CURRENCIES,
  DISCOUNT_DURATIONS,
  DISCOUNT_TYPES,
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
    // Billing-cycle snapshot. Older subscriptions may not have it; reads fall
    // back to the referenced plan's current cycle.
    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
    },
    // Original UTC day-of-month used to keep Jan 31 -> Feb 28 -> Mar 31
    // anniversaries from drifting earlier every month.
    billingAnchorDay: {
      type: Number,
      min: [1, "Billing anchor day must be at least 1"],
      max: [31, "Billing anchor day must be at most 31"],
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
    // Discount terms are snapshotted so later edits to a discount do not
    // silently change a live subscription's price.
    discountType: {
      type: String,
      enum: DISCOUNT_TYPES,
      default: null,
    },
    discountValue: {
      type: Number,
      default: null,
      min: [0, "Discount value cannot be negative"],
      validate: integerValidator,
    },
    discountDuration: {
      type: String,
      enum: DISCOUNT_DURATIONS,
      default: null,
    },
    discountDurationMonths: {
      type: Number,
      default: null,
      min: [1, "Discount duration must be at least 1 month"],
      validate: integerValidator,
    },
    discountApplications: {
      type: Number,
      default: 0,
      min: [0, "Discount applications cannot be negative"],
      validate: integerValidator,
    },
    discountValidUntil: {
      type: Date,
      default: null,
    },
    // Start of the discount's calendar lifetime. Repeating discounts expire
    // after `discountDurationMonths` months regardless of billing cycle.
    discountStartedAt: {
      type: Date,
      default: null,
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
    pastDueAt: {
      type: Date,
      default: null,
    },
    lastRenewedAt: {
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
 * Canceled and expired subscriptions no longer block a new one.
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
subscriptionSchema.index({ status: 1, cancelAtPeriodEnd: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ status: 1, trialEndsAt: 1 });
subscriptionSchema.index({ plan: 1 });
subscriptionSchema.index({ createdAt: -1 });

export const Subscription =
  mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
