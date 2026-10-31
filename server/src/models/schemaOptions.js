/**
 * Shared schema options: timestamps, no `__v`, and JSON-friendly output.
 * Models may override `toJSON` to strip sensitive fields.
 */
export const baseSchemaOptions = Object.freeze({
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

/** Mongoose validator for integer minor units and basis points. */
export const integerValidator = {
  validator: (value) => value === undefined || value === null || Number.isInteger(value),
  message: "{PATH} must be a whole number (minor currency units or basis points)",
};
