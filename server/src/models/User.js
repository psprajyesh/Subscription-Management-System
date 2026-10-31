import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { USER_ROLES, USER_STATUSES } from "../config/constants.js";
import { baseSchemaOptions } from "./schemaOptions.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be at most 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [emailPattern, "Email address is invalid"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "staff",
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "active",
    },
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  baseSchemaOptions,
);

userSchema.index({ role: 1, status: 1 });

/**
 * Guard against accidentally persisting plaintext passwords.
 * Password updates must go through `setPassword()`.
 */
userSchema.pre("validate", function validatePasswordHash() {
  if (
    this.isModified("passwordHash") &&
    this.passwordHash &&
    !bcryptHashPattern.test(this.passwordHash)
  ) {
    throw new Error(
      "passwordHash must be a bcrypt hash. Use user.setPassword() instead of assigning plaintext.",
    );
  }
});

/**
 * Hashes the password exactly once. The model never hashes on save,
 * so calling save() multiple times cannot double-hash the value.
 */
userSchema.methods.setPassword = async function setPassword(plainPassword) {
  if (typeof plainPassword !== "string" || plainPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  this.passwordHash = await bcrypt.hash(plainPassword, env.BCRYPT_ROUNDS);
  this.passwordChangedAt = new Date();
  return this;
};

userSchema.methods.verifyPassword = function verifyPassword(plainPassword) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    return ret;
  },
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
