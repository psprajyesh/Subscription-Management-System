import mongoose from "mongoose";
import {
  CURRENCIES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
} from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";

const refundSchema = new mongoose.Schema(
  {
    refundId: {
      type: String,
      required: true,
      trim: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: [0, "Refund amount cannot be negative"],
      validate: integerValidator,
    },
    status: {
      type: String,
      enum: REFUND_STATUSES,
      default: "pending",
    },
    reason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: [true, "Payment number is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: [true, "Invoice is required"],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    provider: {
      type: String,
      enum: PAYMENT_PROVIDERS,
      default: "manual",
    },
    orderId: {
      type: String,
      trim: true,
      default: "",
    },
    paymentId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    signature: {
      type: String,
      select: false,
    },
    signatureVerified: {
      type: Boolean,
      default: false,
    },
    amountMinor: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0, "Payment amount cannot be negative"],
      validate: integerValidator,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "created",
    },
    method: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    refunds: {
      type: [refundSchema],
      default: [],
    },
    idempotencyKey: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  baseSchemaOptions,
);

paymentSchema.pre("validate", function validateRefunds() {
  if (!this.refunds?.length) return;

  const refunded = this.refunds.reduce((sum, refund) => sum + (refund.amountMinor || 0), 0);
  if (refunded > this.amountMinor) {
    throw new Error("Total refunded amount cannot exceed the payment amount");
  }
});

paymentSchema.index({ invoice: 1, status: 1 });
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1 });

paymentSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.signature;
    return ret;
  },
});

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

export default Payment;
