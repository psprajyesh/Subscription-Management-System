import mongoose from "mongoose";

/**
 * Atomic sequence generator used for invoice and payment numbers.
 * `findOneAndUpdate` with `$inc` is atomic, so concurrent requests
 * can never receive the same number.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    seq: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { versionKey: false },
);

counterSchema.statics.next = async function next(name) {
  const counter = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  return counter.seq;
};

counterSchema.statics.preview = async function preview(name) {
  const counter = await this.findById(name);
  return (counter?.seq ?? 0) + 1;
};

export const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

export default Counter;
