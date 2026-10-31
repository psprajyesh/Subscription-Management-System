import { beforeEach, describe, expect, it } from "vitest";
import {
  Invoice,
  Payment,
  Subscription,
} from "../src/models/index.js";
import {
  processExpirations,
  processRenewals,
  processSubscriptionJobs,
} from "../src/jobs/subscriptionJobs.js";
import { startSubscriptionJobScheduler } from "../src/jobs/scheduler.js";
import {
  clearDatabase,
  createCatalog,
  createCustomerFixture,
  createSubscriptionFixture,
} from "./helpers/fixtures.js";

const NOW = new Date("2026-02-15T00:00:00.000Z");

describe("subscription scheduled jobs", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("renews a due subscription once and creates one open invoice", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await processRenewals({ now: NOW });

    expect(result).toMatchObject({ processed: 1, renewed: 1, skipped: 0, failed: 0 });

    const updated = await Subscription.findById(subscription._id);
    expect(updated.currentPeriodStart.toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(updated.currentPeriodEnd.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(updated.nextBillingAt.toISOString()).toBe("2026-03-01T00:00:00.000Z");

    const invoices = await Invoice.find({ subscription: subscription._id });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      status: "open",
      subtotalMinor: 100_000,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 100_000,
    });
    expect(invoices[0].billingPeriodStart.toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(invoices[0].billingPeriodEnd.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(await Payment.countDocuments()).toBe(0);

    const repeated = await processRenewals({ now: NOW });
    expect(repeated).toMatchObject({ processed: 0, renewed: 0 });
    expect(await Invoice.countDocuments({ subscription: subscription._id })).toBe(1);
  });

  it("does not duplicate invoices when workers run concurrently", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const [first, second] = await Promise.all([
      processRenewals({ now: NOW }),
      processRenewals({ now: NOW }),
    ]);

    expect(first.renewed + second.renewed).toBe(1);
    expect(first.failed + second.failed).toBe(0);
    expect(await Invoice.countDocuments({ subscription: subscription._id })).toBe(1);

    const updated = await Subscription.findById(subscription._id);
    expect(updated.currentPeriodEnd.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });

  it("reuses an existing period invoice and still advances the subscription", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    await Invoice.create({
      invoiceNumber: "INV-EXISTING-0001",
      customer: customer._id,
      subscription: subscription._id,
      billingPeriodStart: new Date("2026-02-01T00:00:00.000Z"),
      billingPeriodEnd: new Date("2026-03-01T00:00:00.000Z"),
      items: [
        {
          description: "Existing renewal",
          quantity: 1,
          unitAmountMinor: 100_000,
          amountMinor: 100_000,
        },
      ],
      subtotalMinor: 100_000,
      totalMinor: 100_000,
      status: "open",
    });

    const result = await processRenewals({ now: NOW });

    expect(result.renewed).toBe(1);
    expect(await Invoice.countDocuments({ subscription: subscription._id })).toBe(1);

    const updated = await Subscription.findById(subscription._id);
    expect(updated.currentPeriodEnd.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });

  it("expires scheduled cancellations at the period boundary without renewing", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      cancelAtPeriodEnd: true,
      currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await processSubscriptionJobs({ now: NOW });

    expect(result.expirations.expired).toBe(1);
    expect(result.renewals.processed).toBe(0);

    const updated = await Subscription.findById(subscription._id);
    expect(updated.status).toBe("canceled");
    expect(updated.cancelAtPeriodEnd).toBe(false);
    expect(updated.endedAt.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(await Invoice.countDocuments({ subscription: subscription._id })).toBe(0);

    const repeated = await processExpirations({ now: NOW });
    expect(repeated.processed).toBe(0);
  });

  it("is safe when expiration workers race", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      cancelAtPeriodEnd: true,
      currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const [first, second] = await Promise.all([
      processExpirations({ now: NOW }),
      processExpirations({ now: NOW }),
    ]);

    expect(first.expired + second.expired).toBe(1);
    expect((await Subscription.findById(subscription._id)).status).toBe("canceled");
  });

  it("expires trials that ended without activation", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000, trialDays: 14 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      status: "trialing",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      trialEndsAt: new Date("2026-01-15T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-01-15T00:00:00.000Z"),
      nextBillingAt: new Date("2026-01-15T00:00:00.000Z"),
    });

    const result = await processExpirations({ now: NOW });

    expect(result.trialExpirations).toBe(1);
    expect(result.expired).toBe(1);

    const updated = await Subscription.findById(subscription._id);
    expect(updated.status).toBe("expired");
    expect(updated.endedAt.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(await Invoice.countDocuments({ subscription: subscription._id })).toBe(0);
  });

  it("renews a past-due subscription without changing its status", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      status: "past_due",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await processRenewals({ now: NOW });

    expect(result.renewed).toBe(1);

    const updated = await Subscription.findById(subscription._id);
    expect(updated.status).toBe("past_due");
    expect(updated.currentPeriodEnd.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(
      await Invoice.countDocuments({
        subscription: subscription._id,
        status: "open",
      }),
    ).toBe(1);
  });

  it("does not consume a once discount when the period invoice has no discount", async () => {
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 100_000 });
    const subscription = await createSubscriptionFixture({
      customer,
      plan,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
      nextBillingAt: new Date("2026-02-01T00:00:00.000Z"),
      discountType: "percentage",
      discountValue: 10,
      discountDuration: "once",
      discountApplications: 0,
      discountStartedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await Invoice.create({
      invoiceNumber: "INV-EXISTING-0002",
      customer: customer._id,
      subscription: subscription._id,
      billingPeriodStart: new Date("2026-02-01T00:00:00.000Z"),
      billingPeriodEnd: new Date("2026-03-01T00:00:00.000Z"),
      items: [
        {
          description: "Existing renewal",
          quantity: 1,
          unitAmountMinor: 100_000,
          amountMinor: 100_000,
        },
      ],
      subtotalMinor: 100_000,
      totalMinor: 100_000,
      status: "open",
    });

    const result = await processRenewals({ now: NOW });
    expect(result.renewed).toBe(1);

    const updated = await Subscription.findById(subscription._id);
    expect(updated.discountApplications).toBe(0);
    expect(
      await Invoice.countDocuments({ subscription: subscription._id }),
    ).toBe(1);
  });

  it("does not schedule cron jobs in the test environment", () => {
    expect(startSubscriptionJobScheduler()).toBeNull();
  });
});
