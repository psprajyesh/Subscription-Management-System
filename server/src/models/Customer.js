import mongoose from "mongoose";
import { CURRENCIES, CUSTOMER_STATUSES } from "../config/constants.js";
import { baseSchemaOptions } from "./schemaOptions.js";
import { softDeletePlugin } from "./plugins/softDelete.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [120, "Customer name must be at most 120 characters"],
    },
    email: {
      type: String,
      required: [true, "Customer email is required"],
      lowercase: true,
      trim: true,
      match: [emailPattern, "Customer email is invalid"],
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    company: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    billingAddress: {
      line1: { type: String, trim: true, default: "" },
      line2: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, uppercase: true, default: "IN" },
      postalCode: { type: String, trim: true, default: "" },
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      maxlength: 20,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },
    status: {
      type: String,
      enum: CUSTOMER_STATUSES,
      default: "active",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  baseSchemaOptions,
);

customerSchema.plugin(softDeletePlugin);

// Soft-deleted customers do not block re-registration with the same email.
customerSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
customerSchema.index({ name: "text", email: "text", company: "text" });
customerSchema.index({ status: 1, createdAt: -1 });

export const Customer = mongoose.models.Customer || mongoose.model("Customer", customerSchema);

export default Customer;
