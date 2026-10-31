import mongoose from "mongoose";
import { PRODUCT_STATUSES } from "../config/constants.js";
import { baseSchemaOptions } from "./schemaOptions.js";
import { softDeletePlugin } from "./plugins/softDelete.js";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [120, "Product name must be at most 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: PRODUCT_STATUSES,
      default: "draft",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  baseSchemaOptions,
);

productSchema.plugin(softDeletePlugin);

productSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
productSchema.index({ status: 1, createdAt: -1 });

export const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

export default Product;
