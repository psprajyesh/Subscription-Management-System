import { beforeEach, describe, expect, it } from "vitest";
import { Customer } from "../../src/models/index.js";

beforeEach(async () => {
  await Customer.deleteMany({});
});

describe("Customer soft delete", () => {
  it("hides soft-deleted customers by default but keeps the record", async () => {
    const customer = await Customer.create({
      name: "Soft Delete",
      email: "soft.delete@example.com",
    });

    await customer.softDelete();

    expect(await Customer.findOne({ email: "soft.delete@example.com" })).toBeNull();
    expect(await Customer.countDocuments()).toBe(0);

    const withDeleted = await Customer.findOne({ email: "soft.delete@example.com" }).setOptions({
      withDeleted: true,
    });
    expect(withDeleted).not.toBeNull();
    expect(withDeleted.deletedAt).toBeInstanceOf(Date);
  });

  it("frees the email for re-registration after soft delete", async () => {
    const original = await Customer.create({
      name: "Original Owner",
      email: "reuse@example.com",
    });
    await original.softDelete();

    const replacement = await Customer.create({
      name: "New Owner",
      email: "reuse@example.com",
    });

    expect(replacement._id).not.toEqual(original._id);
    expect(await Customer.countDocuments()).toBe(1);
  });

  it("restores a soft-deleted customer", async () => {
    const customer = await Customer.create({
      name: "Restore Me",
      email: "restore@example.com",
    });

    await customer.softDelete();
    await customer.restore();

    const restored = await Customer.findOne({ email: "restore@example.com" });
    expect(restored).not.toBeNull();
    expect(restored.deletedAt).toBeNull();
  });

  it("validates customer emails", async () => {
    await expect(
      Customer.create({ name: "Bad Email", email: "not-an-email" }),
    ).rejects.toThrow(/invalid/i);
  });
});
