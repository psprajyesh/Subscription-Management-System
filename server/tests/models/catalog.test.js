import { beforeEach, describe, expect, it } from "vitest";
import { Discount, Plan, Product, Tax } from "../../src/models/index.js";

beforeEach(async () => {
  await Promise.all([
    Product.deleteMany({}),
    Plan.deleteMany({}),
    Tax.deleteMany({}),
    Discount.deleteMany({}),
  ]);
});

describe("Catalog models", () => {
  it("links plans to products and populates the relationship", async () => {
    const product = await Product.create({
      name: "Analytics Suite",
      description: "Analytics tools",
      status: "active",
    });

    const plan = await Plan.create({
      product: product._id,
      name: "Professional",
      billingCycle: "monthly",
      priceMinor: 149_900,
    });

    const populated = await Plan.findById(plan._id).populate("product");

    expect(populated.product.name).toBe("Analytics Suite");
    expect(populated.priceMinor).toBe(149_900);
    expect(populated.currency).toBe("INR");
  });

  it("rejects duplicate product names", async () => {
    await Product.create({ name: "Duplicate Product" });

    await expect(Product.create({ name: "Duplicate Product" })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("rejects duplicate plan combinations for the same product", async () => {
    const product = await Product.create({ name: "Plan Product" });
    const plan = {
      product: product._id,
      name: "Starter",
      billingCycle: "monthly",
      priceMinor: 49_900,
    };

    await Plan.create(plan);
    await expect(Plan.create(plan)).rejects.toMatchObject({ code: 11000 });
  });

  it("allows the same plan name on different billing cycles", async () => {
    const product = await Product.create({ name: "Cycle Product" });

    await Plan.create({
      product: product._id,
      name: "Team",
      billingCycle: "monthly",
      priceMinor: 99_900,
    });

    const yearly = await Plan.create({
      product: product._id,
      name: "Team",
      billingCycle: "yearly",
      priceMinor: 999_900,
    });

    expect(yearly.billingCycle).toBe("yearly");
  });

  it("validates billing cycles, integer prices and non-negative amounts", async () => {
    const product = await Product.create({ name: "Validation Product" });

    await expect(
      Plan.create({
        product: product._id,
        name: "Bad Cycle",
        billingCycle: "weekly",
        priceMinor: 1_000,
      }),
    ).rejects.toThrow(/billingCycle/i);

    await expect(
      Plan.create({
        product: product._id,
        name: "Negative",
        billingCycle: "monthly",
        priceMinor: -1,
      }),
    ).rejects.toThrow(/negative/i);

    await expect(
      Plan.create({
        product: product._id,
        name: "Fractional",
        billingCycle: "monthly",
        priceMinor: 1499.5,
      }),
    ).rejects.toThrow(/whole number/i);
  });

  it("allows only one active default tax", async () => {
    await Tax.create({ name: "Standard GST", rateBasisPoints: 1800, isDefault: true });

    await expect(
      Tax.create({ name: "Second Default", rateBasisPoints: 500, isDefault: true }),
    ).rejects.toMatchObject({ code: 11000 });

    const optional = await Tax.create({
      name: "Reduced GST",
      rateBasisPoints: 500,
      isDefault: false,
    });
    expect(optional.isDefault).toBe(false);
  });

  it("validates tax rates in basis points", async () => {
    await expect(
      Tax.create({ name: "Too High", rateBasisPoints: 10_001 }),
    ).rejects.toThrow(/100%/i);
  });

  it("normalises discount codes and enforces uniqueness", async () => {
    const discount = await Discount.create({
      code: "welcome10",
      type: "percentage",
      value: 10,
    });

    expect(discount.code).toBe("WELCOME10");

    await expect(
      Discount.create({ code: "WELCOME10", type: "percentage", value: 15 }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("rejects percentage discounts above 100 and invalid date ranges", async () => {
    await expect(
      Discount.create({ code: "OVER100", type: "percentage", value: 101 }),
    ).rejects.toThrow(/cannot exceed 100/i);

    await expect(
      Discount.create({
        code: "BADDATES",
        type: "fixed",
        value: 50_000,
        validFrom: new Date("2026-10-01"),
        validUntil: new Date("2026-09-01"),
      }),
    ).rejects.toThrow(/after validFrom/i);
  });
});
