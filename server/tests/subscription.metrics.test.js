import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { getSubscriptionMetrics } from "../src/services/subscriptionMetrics.service.js";
import {
  bootstrapAdmin,
  clearDatabase,
  createCatalog,
  createCustomerFixture,
  createSubscriptionFixture,
} from "./helpers/fixtures.js";

const app = createApp();
const START = new Date("2026-09-01T00:00:00.000Z");
const PERIOD_FROM = new Date("2026-10-01T00:00:00.000Z");
const PERIOD_TO = new Date("2026-11-01T00:00:00.000Z");
const NOW = new Date("2026-10-31T00:00:00.000Z");

describe("subscription financial metrics", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("calculates MRR/ARR, active, past-due and churn consistently", async () => {
    const customer = await createCustomerFixture();
    const pausedCustomer = await createCustomerFixture({
      name: "Paused Customer",
      email: "paused@brightloop.test",
    });
    const trialCustomer = await createCustomerFixture({
      name: "Trial Customer",
      email: "trial@brightloop.test",
    });
    const { plan: monthly } = await createCatalog({
      productName: "Metric Monthly",
      planName: "Monthly",
      billingCycle: "monthly",
      priceMinor: 120_000,
    });
    const { plan: yearly } = await createCatalog({
      productName: "Metric Yearly",
      planName: "Yearly",
      billingCycle: "yearly",
      priceMinor: 1_200_000,
    });
    const { plan: pastDuePlan } = await createCatalog({
      productName: "Metric Past Due",
      planName: "Past Due",
      billingCycle: "monthly",
      priceMinor: 60_000,
    });

    await createSubscriptionFixture({
      customer,
      plan: monthly,
      quantity: 2,
      startedAt: START,
      discountType: "fixed",
      discountValue: 10_000,
      discountDuration: "forever",
    });
    await createSubscriptionFixture({
      customer,
      plan: yearly,
      startedAt: START,
      discountType: "percentage",
      discountValue: 10,
      discountDuration: "forever",
    });
    await createSubscriptionFixture({
      customer,
      plan: pastDuePlan,
      status: "past_due",
      startedAt: START,
    });
    await createSubscriptionFixture({
      customer,
      plan: pastDuePlan,
      status: "canceled",
      startedAt: START,
      endedAt: new Date("2026-10-15T00:00:00.000Z"),
      canceledAt: new Date("2026-10-15T00:00:00.000Z"),
      priceMinor: 999_999,
    });
    await createSubscriptionFixture({
      customer,
      plan: pastDuePlan,
      status: "expired",
      startedAt: START,
      endedAt: new Date("2026-09-20T00:00:00.000Z"),
      priceMinor: 888_888,
    });
    await createSubscriptionFixture({
      customer: pausedCustomer,
      plan: pastDuePlan,
      status: "paused",
      startedAt: START,
      pausedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    await createSubscriptionFixture({
      customer: trialCustomer,
      plan: pastDuePlan,
      status: "trialing",
      startedAt: START,
      trialEndsAt: new Date("2026-09-15T00:00:00.000Z"),
    });

    const metrics = await getSubscriptionMetrics({
      from: PERIOD_FROM,
      to: PERIOD_TO,
      now: NOW,
    });

    expect(metrics.mrrMinor).toBe(380_000);
    expect(metrics.arrMinor).toBe(4_560_000);
    expect(metrics.activeSubscriptions).toBe(2);
    expect(metrics.pastDueSubscriptions).toBe(1);
    expect(metrics.payingSubscriptions).toBe(3);
    expect(metrics.activeAtPeriodStart).toBe(6);
    expect(metrics.canceledInPeriod).toBe(1);
    expect(metrics.churnRate).toBe(16.67);
    expect(metrics.churnRateRatio).toBe(0.1667);
  });

  it("does not count subscriptions created during the period as churn", async () => {
    const customer = await createCustomerFixture();
    const newCustomer = await createCustomerFixture({
      name: "New Customer",
      email: "new@brightloop.test",
    });
    const { plan } = await createCatalog({ priceMinor: 100_000 });

    await createSubscriptionFixture({
      customer,
      plan,
      startedAt: START,
    });

    await createSubscriptionFixture({
      customer: newCustomer,
      plan,
      startedAt: new Date("2026-10-10T00:00:00.000Z"),
      status: "canceled",
      endedAt: new Date("2026-10-20T00:00:00.000Z"),
      canceledAt: new Date("2026-10-20T00:00:00.000Z"),
    });

    const metrics = await getSubscriptionMetrics({
      from: PERIOD_FROM,
      to: PERIOD_TO,
      now: NOW,
    });

    expect(metrics.activeAtPeriodStart).toBe(1);
    expect(metrics.canceledInPeriod).toBe(0);
    expect(metrics.churnRate).toBe(0);
  });

  it("excludes subscriptions that have not started from MRR and counts", async () => {
    const customer = await createCustomerFixture();
    const futureCustomer = await createCustomerFixture({
      name: "Future Customer",
      email: "future@brightloop.test",
    });
    const { plan } = await createCatalog({ priceMinor: 100_000 });

    await createSubscriptionFixture({
      customer,
      plan,
      startedAt: START,
    });
    await createSubscriptionFixture({
      customer: futureCustomer,
      plan,
      startedAt: new Date("2026-12-01T00:00:00.000Z"),
      priceMinor: 999_999,
    });

    const metrics = await getSubscriptionMetrics({
      from: PERIOD_FROM,
      to: PERIOD_TO,
      now: NOW,
    });

    expect(metrics.mrrMinor).toBe(100_000);
    expect(metrics.arrMinor).toBe(1_200_000);
    expect(metrics.activeSubscriptions).toBe(1);
    expect(metrics.payingSubscriptions).toBe(1);
  });

  it("exposes metrics and past-due lists to authenticated users", async () => {
    const admin = await bootstrapAdmin(app);
    const customer = await createCustomerFixture();
    const { plan } = await createCatalog({ priceMinor: 120_000 });

    await createSubscriptionFixture({
      customer,
      plan,
      status: "past_due",
      startedAt: START,
    });

    const metrics = await admin.get(
      `/api/subscriptions/metrics?from=${PERIOD_FROM.toISOString()}&to=${PERIOD_TO.toISOString()}`,
    );
    expect(metrics.status).toBe(200);
    expect(metrics.body.data.mrrMinor).toBe(120_000);
    expect(metrics.body.data.pastDueSubscriptions).toBe(1);

    const pastDue = await admin.get("/api/subscriptions/past-due");
    expect(pastDue.status).toBe(200);
    expect(pastDue.body.data.items).toHaveLength(1);
    expect(pastDue.body.meta.total).toBe(1);

    const invalid = await admin.get("/api/subscriptions/metrics?from=bad");
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });
});
