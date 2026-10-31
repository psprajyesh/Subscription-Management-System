import { beforeEach, describe, expect, it } from "vitest";
import {
  Customer,
  Invoice,
  Payment,
  Plan,
  Product,
  Subscription,
} from "../../src/models/index.js";

const periodStart = new Date("2026-10-01T00:00:00.000Z");
const periodEnd = new Date("2026-11-01T00:00:00.000Z");

async function createCustomerAndPlan(suffix) {
  const customer = await Customer.create({
    name: `Customer ${suffix}`,
    email: `customer.${suffix}@example.com`,
  });

  const product = await Product.create({ name: `Product ${suffix}` });

  const plan = await Plan.create({
    product: product._id,
    name: `Plan ${suffix}`,
    billingCycle: "monthly",
    priceMinor: 149_900,
  });

  return { customer, plan, product };
}

function baseSubscription(customer, plan) {
  return {
    customer: customer._id,
    plan: plan._id,
    status: "active",
    priceMinor: 149_900,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    nextBillingAt: periodEnd,
  };
}

beforeEach(async () => {
  await Promise.all([
    Payment.deleteMany({}),
    Invoice.deleteMany({}),
    Subscription.deleteMany({}),
    Customer.deleteMany({}),
    Plan.deleteMany({}),
    Product.deleteMany({}),
  ]);
});

describe("Subscription rules", () => {
  it("prevents duplicate live subscriptions for the same customer and plan", async () => {
    const { customer, plan } = await createCustomerAndPlan("duplicate");

    await Subscription.create(baseSubscription(customer, plan));

    await expect(
      Subscription.create(baseSubscription(customer, plan)),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("allows the same customer to subscribe to different plans", async () => {
    const { customer, plan, product } = await createCustomerAndPlan("multi");

    const secondPlan = await Plan.create({
      product: product._id,
      name: "Second Plan",
      billingCycle: "yearly",
      priceMinor: 999_900,
    });

    await Subscription.create(baseSubscription(customer, plan));
    const second = await Subscription.create({
      ...baseSubscription(customer, plan),
      plan: secondPlan._id,
      priceMinor: 999_900,
    });

    expect(second.status).toBe("active");
    expect(await Subscription.countDocuments({ customer: customer._id })).toBe(2);
  });

  it("allows a new subscription after the previous one is canceled", async () => {
    const { customer, plan } = await createCustomerAndPlan("cancel");

    const original = await Subscription.create(baseSubscription(customer, plan));
    original.status = "canceled";
    original.canceledAt = new Date();
    await original.save();

    const replacement = await Subscription.create(baseSubscription(customer, plan));

    expect(replacement._id).not.toEqual(original._id);
    expect(await Subscription.countDocuments({ customer: customer._id })).toBe(2);
  });

  it("still blocks duplicates while a subscription is past due", async () => {
    const { customer, plan } = await createCustomerAndPlan("past-due");

    const original = await Subscription.create(baseSubscription(customer, plan));
    original.status = "past_due";
    await original.save();

    await expect(
      Subscription.create(baseSubscription(customer, plan)),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("populates customer and plan relationships", async () => {
    const { customer, plan } = await createCustomerAndPlan("populate");
    const subscription = await Subscription.create(baseSubscription(customer, plan));

    const populated = await Subscription.findById(subscription._id)
      .populate("customer")
      .populate("plan");

    expect(populated.customer.email).toBe("customer.populate@example.com");
    expect(populated.plan.name).toBe("Plan populate");
  });

  it("rejects invalid statuses and invalid billing periods", async () => {
    const { customer, plan } = await createCustomerAndPlan("invalid");

    await expect(
      Subscription.create({ ...baseSubscription(customer, plan), status: "unknown" }),
    ).rejects.toThrow(/enum/i);

    await expect(
      Subscription.create({
        ...baseSubscription(customer, plan),
        currentPeriodStart: periodEnd,
        currentPeriodEnd: periodStart,
      }),
    ).rejects.toThrow(/after currentPeriodStart/i);
  });
});

describe("Invoice and payment relationships", () => {
  it("creates an invoice for a subscription with consistent totals", async () => {
    const { customer, plan } = await createCustomerAndPlan("invoice");
    const subscription = await Subscription.create(baseSubscription(customer, plan));

    const subtotalMinor = 149_900;
    const taxMinor = 26_982;
    const invoice = await Invoice.create({
      invoiceNumber: "INV-TEST-0001",
      customer: customer._id,
      subscription: subscription._id,
      items: [
        {
          description: "Professional monthly",
          quantity: 1,
          unitAmountMinor: subtotalMinor,
          amountMinor: subtotalMinor,
        },
      ],
      subtotalMinor,
      discountMinor: 0,
      taxMinor,
      totalMinor: subtotalMinor + taxMinor,
      status: "paid",
      dueDate: periodEnd,
      paidAt: new Date("2026-10-31T00:00:00.000Z"),
    });

    const payment = await Payment.create({
      paymentNumber: "PAY-TEST-0001",
      invoice: invoice._id,
      customer: customer._id,
      subscription: subscription._id,
      amountMinor: invoice.totalMinor,
      status: "captured",
      paymentId: "pay_test_0001",
      signature: "test-signature",
      signatureVerified: true,
      paidAt: invoice.paidAt,
    });

    expect(payment.invoice.toString()).toBe(invoice._id.toString());
    expect(payment.amountMinor).toBe(176_882);

    const populated = await Payment.findById(payment._id).populate("invoice customer subscription");
    expect(populated.invoice.invoiceNumber).toBe("INV-TEST-0001");
    expect(populated.customer.email).toBe("customer.invoice@example.com");
    expect(populated.subscription.status).toBe("active");
  });

  it("rejects inconsistent invoice subtotals and totals", async () => {
    const { customer, plan } = await createCustomerAndPlan("bad-invoice");
    const subscription = await Subscription.create(baseSubscription(customer, plan));

    await expect(
      Invoice.create({
        invoiceNumber: "INV-TEST-0002",
        customer: customer._id,
        subscription: subscription._id,
        items: [{ description: "Item", quantity: 1, unitAmountMinor: 100, amountMinor: 200 }],
        subtotalMinor: 100,
        taxMinor: 0,
        totalMinor: 100,
        dueDate: periodEnd,
      }),
    ).rejects.toThrow(/sum of invoice item amounts/i);

    await expect(
      Invoice.create({
        invoiceNumber: "INV-TEST-0003",
        customer: customer._id,
        subscription: subscription._id,
        items: [{ description: "Item", quantity: 1, unitAmountMinor: 100, amountMinor: 100 }],
        subtotalMinor: 100,
        taxMinor: 18,
        totalMinor: 100,
        dueDate: periodEnd,
      }),
    ).rejects.toThrow(/totalMinor must equal/i);
  });

  it("enforces unique provider payment ids and hides signatures in JSON", async () => {
    const { customer, plan } = await createCustomerAndPlan("payment");
    const subscription = await Subscription.create(baseSubscription(customer, plan));

    const invoice = await Invoice.create({
      invoiceNumber: "INV-TEST-0004",
      customer: customer._id,
      subscription: subscription._id,
      items: [{ description: "Item", quantity: 1, unitAmountMinor: 100, amountMinor: 100 }],
      subtotalMinor: 100,
      taxMinor: 18,
      totalMinor: 118,
      dueDate: periodEnd,
    });

    const first = await Payment.create({
      paymentNumber: "PAY-TEST-0004",
      invoice: invoice._id,
      customer: customer._id,
      amountMinor: 118,
      status: "captured",
      paymentId: "pay_test_duplicate",
      signature: "secret-signature",
      signatureVerified: true,
    });

    const stored = await Payment.findById(first._id).select("+signature");
    expect(stored.signature).toBe("secret-signature");
    expect(stored.toJSON().signature).toBeUndefined();

    await expect(
      Payment.create({
        paymentNumber: "PAY-TEST-0005",
        invoice: invoice._id,
        customer: customer._id,
        amountMinor: 118,
        status: "captured",
        paymentId: "pay_test_duplicate",
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("rejects refunds larger than the payment amount", async () => {
    const { customer, plan } = await createCustomerAndPlan("refund");
    const subscription = await Subscription.create(baseSubscription(customer, plan));

    const invoice = await Invoice.create({
      invoiceNumber: "INV-TEST-0006",
      customer: customer._id,
      subscription: subscription._id,
      items: [{ description: "Item", quantity: 1, unitAmountMinor: 100, amountMinor: 100 }],
      subtotalMinor: 100,
      taxMinor: 18,
      totalMinor: 118,
      dueDate: periodEnd,
    });

    await expect(
      Payment.create({
        paymentNumber: "PAY-TEST-0006",
        invoice: invoice._id,
        customer: customer._id,
        amountMinor: 118,
        status: "refunded",
        refunds: [{ refundId: "rfnd_test", amountMinor: 200, status: "processed" }],
      }),
    ).rejects.toThrow(/cannot exceed/i);
  });
});
