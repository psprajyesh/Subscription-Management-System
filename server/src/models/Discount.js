import mongoose from "mongoose";
import {
  DISCOUNT_DURATIONS,
  DISCOUNT_STATUSES,
  DISCOUNT_TYPES,
} from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";
import { softDeletePlugin } from "./plugins/softDelete.js";

const discountSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Discount code is required"],
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    type: {
      type: String,
      enum: DISCOUNT_TYPES,
      required: [true, "Discount type is required"],
    },
    // Percentage points (e.g. 10) for `percentage`, paise for `fixed`.
    value: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value cannot be negative"],
      validate: integerValidator,
    },
    duration: {
      type: String,
      enum: DISCOUNT_DURATIONS,
      default: "once",
    },
    durationMonths: {
      type: Number,
      min: [1, "Duration must be at least 1 month"],
      default: null,
      validate: {
        validator(value) {
          if (this.duration !== "repeating") return true;
          return Number.isInteger(value) && value >= 1;
        },
        message: "durationMonths is required when duration is 'repeating'",
      },
    },
    maxRedemptions: {
      type: Number,
      min: [1, "maxRedemptions must be at least 1"],
      default: null,
      validate: integerValidator,
    },
    timesRedeemed: {
      type: Number,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
    minAmountMinor: {
      type: Number,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
    appliesToProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    appliesToPlans: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
      },
    ],
    validFrom: {
      type: Date,
      default: () => new Date(),
    },
    validUntil: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: DISCOUNT_STATUSES,
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

discountSchema.plugin(softDeletePlugin);

discountSchema.pre("validate", function validateDiscount() {
  if (this.type === "percentage" && this.value !== undefined && this.value > 100) {
    throw new Error("Percentage discounts cannot exceed 100");
  }

  if (this.validFrom && this.validUntil && this.validUntil <= this.validFrom) {
    throw new Error("validUntil must be after validFrom");
  }
});

discountSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
discountSchema.index({ status: 1, validUntil: 1 });

export const Discount = mongoose.models.Discount || mongoose.model("Discount", discountSchema);

export default Discount;
