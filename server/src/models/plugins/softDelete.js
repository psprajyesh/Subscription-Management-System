import mongoose from "mongoose";

/**
 * Soft-delete support for records that must remain recoverable
 * (customers, catalog, discounts, taxes, staff).
 *
 * - Adds `deletedAt` / `deletedBy`.
 * - Excludes deleted records from find/count queries by default.
 * - Allows a caller to opt in with `.setOptions({ withDeleted: true })`.
 * - Never physically removes financial history (invoices/payments are not soft-deleted).
 */
export function softDeletePlugin(schema) {
  schema.add({
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  });

  schema.index({ deletedAt: 1 });

  function excludeDeleted() {
    const options = typeof this.getOptions === "function" ? this.getOptions() : this.options || {};
    const filter = typeof this.getFilter === "function" ? this.getFilter() : this._conditions || {};

    if (!options.withDeleted && filter.deletedAt === undefined) {
      this.where({ deletedAt: null });
    }
  }

  schema.pre(/^find/, excludeDeleted);
  schema.pre("countDocuments", excludeDeleted);

  schema.methods.softDelete = function softDelete(userId = null) {
    this.deletedAt = new Date();
    this.deletedBy = userId;
    return this.save();
  };

  schema.methods.restore = function restore() {
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };
}

export default softDeletePlugin;
