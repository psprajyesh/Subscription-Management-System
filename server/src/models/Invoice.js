import mongoose from "mongoose";
import { CURRENCIES, INVOICE_STATUSES } from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";

const invoiceItemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, "Invoice item description is required"],
      trim: true,
      maxlength: 300,
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, "Item quantity must be at least 1"],
      validate: integerValidator,
    },
    unitAmountMinor: {
      type: Number,
      required: true,
      min: [0, "Item unit amount cannot be negative"],
      validate: integerValidator,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: [0, "Item amount cannot be negative"],
      validate: integerValidator,
    },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, "Invoice number is required"],
      unique: true,
      trim: true,
      uppercase: true,
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
    // Renewal invoices carry their billing period. The partial unique index
    // below makes retries and concurrent workers safe: one invoice per
    // subscription period can ever be created.
    billingPeriodStart: {
      type: Date,
      default: null,
    },
    billingPeriodEnd: {
      type: Date,
      default: null,
    },
    items: {
      type: [invoiceItemSchema],
      default: [],
    },
    subtotalMinor: {
      type: Number,
      required: true,
      min: [0, "Subtotal cannot be negative"],
      validate: integerValidator,
    },
    discountMinor: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
      validate: integerValidator,
    },
    taxMinor: {
      type: Number,
      default: 0,
      min: [0, "Tax cannot be negative"],
      validate: integerValidator,
    },
    totalMinor: {
      type: Number,
      required: true,
      min: [0, "Total cannot be negative"],
      validate: integerValidator,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "draft",
    },
    issueDate: {
      type: Date,
      default: () => new Date(),
    },
    dueDate: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    paidAt: {
      type: Date,
      default: null,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    pdfGeneratedAt: {
      type: Date,
      default: null,
    },
  },
  baseSchemaOptions,
);

invoiceSchema.pre("validate", function validateTotals() {
  if (this.items?.length) {
    const computedSubtotal = this.items.reduce((sum, item) => sum + (item.amountMinor || 0), 0);
    if (this.subtotalMinor !== computedSubtotal) {
      throw new Error("subtotalMinor must equal the sum of invoice item amounts");
    }
  }

  if (
    this.subtotalMinor !== undefined &&
    this.discountMinor !== undefined &&
    this.taxMinor !== undefined &&
    this.totalMinor !== undefined &&
    this.totalMinor !== this.subtotalMinor - this.discountMinor + this.taxMinor
  ) {
    throw new Error(
      "totalMinor must equal subtotalMinor minus discountMinor plus taxMinor",
    );
  }
});

invoiceSchema.index({ customer: 1, status: 1, issueDate: -1 });
invoiceSchema.index({ subscription: 1, issueDate: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index(
  { subscription: 1, billingPeriodStart: 1 },
  {
    unique: true,
    partialFilterExpression: { billingPeriodStart: { $type: "date" } },
  },
);

export const Invoice = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);

export default Invoice;
