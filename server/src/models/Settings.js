import mongoose from "mongoose";
import { CURRENCIES } from "../config/constants.js";
import { baseSchemaOptions, integerValidator } from "./schemaOptions.js";

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "workspace",
      immutable: true,
    },
    workspaceName: {
      type: String,
      trim: true,
      default: "Brightloop Software",
      maxlength: 120,
    },
    currency: {
      type: String,
      enum: CURRENCIES,
      default: "INR",
    },
    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
      maxlength: 60,
    },
    invoicePrefix: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INV",
      maxlength: 10,
    },
    invoiceDueDays: {
      type: Number,
      min: [0, "Invoice due days cannot be negative"],
      max: [365, "Invoice due days cannot exceed 365"],
      default: 7,
      validate: integerValidator,
    },
    defaultTax: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tax",
      default: null,
    },
    supportEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 160,
    },
  },
  baseSchemaOptions,
);

settingsSchema.statics.getSingleton = function getSingleton() {
  return this.findOneAndUpdate(
    { key: "workspace" },
    { $setOnInsert: { key: "workspace" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
};

export const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

export default Settings;
