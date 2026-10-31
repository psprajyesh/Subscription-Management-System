import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { AuditLog, Discount, Plan, Subscription, User } from "../src/models/index.js";
import { addMonthsUTC } from "../src/utils/dates.js";
import {
  bootstrapAdmin,
  clearDatabase,
  createCatalog,
  createCustomerFixture,
  createUser,
  loginAgent,
} from "./helpers/fixtures.js";

const app = createApp();

async function setup({ planOptions = {} } = {}) {
  const admin = await bootstrapAdmin(app);
  const customer = await createCustomerFixture();
  const { product, plan } = await createCatalog(planOptions);
  return { admin, customer, product, plan };
}

async function createViaApi(admin, customer, plan, overrides = {}) {
  return admin.post("/api/subscriptions").send({
    customer: customer._id.toString(),
    plan: plan._id.toString(),
    startedAt: "2026-01-31T00:00:00.000Z",
    ...overrides,
  });
}

describe("subscription creation and validation", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("creates an active subscription with a price and billing-cycle snapshot", async () => {
    const { admin, customer, plan } = await setup();

    const response = await createViaApi(admin, customer, plan, { quantity: 2 });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.item).toMatchObject({
      customer: customer._id.toString(),
      plan: plan._id.toString(),
      status: "active",
      quantity: 2,
      priceMinor: 100_000,
      billingCycle: "monthly",
      currentPeriodStart: "2026-01-31T00:00:00.000Z",
      currentPeriodEnd: "2026-02-28T00:00:00.000Z",
      nextBillingAt: "2026-02-28T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    expect(await AuditLog.countDocuments({ action: "subscription.created" })).toBe(1);
  });

  it("prevents duplicate live subscriptions but allows a new one after cancellation", async () => {
    const { admin, customer, plan } = await setup();

    const first = await createViaApi(admin, customer, plan);
    expect(first.status).toBe(201);

    const duplicate = await createViaApi(admin, customer, plan);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE_SUBSCRIPTION");

    await admin.post(`/api/subscriptions/${first.body.data.item._id}/cancel`).send({});

    const replacement = await createViaApi(admin, customer, plan);
    expect(replacement.status).toBe(201);
    expect(replacement.body.data.item._id).not.toBe(first.body.data.item._id);
  });

  it("rejects archived plans, inactive customers and invalid discount codes", async () => {
    const { admin, customer, plan } = await setup();

    await Plan.findByIdAndUpdate(plan._id, { status: "archived" });
    const archived = await createViaApi(admin, customer, plan);
    expect(archived.status).toBe(422);
    expect(archived.body.error.code).toBe("PLAN_UNAVAILABLE");

    await Plan.findByIdAndUpdate(plan._id, { status: "active" });
    customer.status = "inactive";
    await customer.save();
    const inactive = await createViaApi(admin, customer, plan);
    expect(inactive.status).toBe(422);
    expect(inactive.body.error.code).toBe("CUSTOMER_UNAVAILABLE");

    customer.status = "active";
    await customer.save();
    const invalidDiscount = await createViaApi(admin, customer, plan, {
      discountCode: "NOPE",
    });
    expect(invalidDiscount.status).toBe(422);
    expect(invalidDiscount.body.error.code).toBe("DISCOUNT_UNAVAILABLE");
  });

  it("snapshots percentage discounts and consumes a redemption", async () => {
    const { admin, customer, plan } = await setup();

    await Discount.create({
      code: "SAVE10",
      type: "percentage",
      value: 10,
      duration: "once",
      status: "active",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await createViaApi(admin, customer, plan, {
      discountCode: "save10",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.item).toMatchObject({
      discountCode: "SAVE10",
      discountType: "percentage",
      discountValue: 10,
      discountDuration: "once",
      discountApplications: 0,
    });
    expect((await Discount.findOne({ code: "SAVE10" })).timesRedeemed).toBe(1);
  });

  it("rejects mass assignment and unauthenticated requests", async () => {
    const { admin, customer, plan } = await setup();

    const massAssignment = await createViaApi(admin, customer, plan, {
      status: "past_due",
      priceMinor: 1,
    });
    expect(massAssignment.status).toBe(422);
    expect(massAssignment.body.error.code).toBe("VALIDATION_ERROR");

    const anonymous = await request(app).post("/api/subscriptions").send({
      customer: customer._id.toString(),
      plan: plan._id.toString(),
    });
    expect(anonymous.status).toBe(401);
  });

  it("allows staff to create and list subscriptions", async () => {
    const { customer, plan } = await setup();
    const staffUser = await createUser({
      name: "Staff Member",
      email: "staff@brightloop.test",
      role: "staff",
    });
    const staff = await loginAgent(app, staffUser.email);

    const created = await createViaApi(staff, customer, plan);
    expect(created.status).toBe(201);

    const listed = await staff.get("/api/subscriptions");
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.meta.total).toBe(1);
  });
});

describe("subscription trial lifecycle", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("creates, activates and idempotently re-activates a trial", async () => {
    const { admin, customer, plan } = await setup({ planOptions: { trialDays: 14 } });

    const created = await createViaApi(admin, customer, plan, {
      startTrial: true,
      startedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(created.status).toBe(201);
    expect(created.body.data.item).toMatchObject({
      status: "trialing",
      trialEndsAt: "2026-01-15T00:00:00.000Z",
      currentPeriodEnd: "2026-01-15T00:00:00.000Z",
      nextBillingAt: "2026-01-15T00:00:00.000Z",
    });

    const id = created.body.data.item._id;
    const activated = await admin.post(`/api/subscriptions/${id}/trial/activate`);
    expect(activated.status).toBe(200);
    expect(activated.body.data.item.status).toBe("active");
    expect(new Date(activated.body.data.item.currentPeriodEnd).getTime()).toBeGreaterThan(
      Date.now(),
    );

    const repeated = await admin.post(`/api/subscriptions/${id}/trial/activate`);
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.item.status).toBe("active");
    expect(repeated.body.data.item.currentPeriodEnd).toBe(
      activated.body.data.item.currentPeriodEnd,
    );
  });

  it("rejects trials for plans without a trial period", async () => {
    const { admin, customer, plan } = await setup();

    const response = await createViaApi(admin, customer, plan, { startTrial: true });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("TRIAL_NOT_AVAILABLE");
  });
});

describe("pause, resume, cancellation and state transitions", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("pauses and resumes idempotently", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;

    const paused = await admin.post(`/api/subscriptions/${id}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.data.item.status).toBe("paused");
    expect(paused.body.data.item.pausedAt).toBeTruthy();

    const pausedAgain = await admin.post(`/api/subscriptions/${id}/pause`);
    expect(pausedAgain.status).toBe(200);
    expect(pausedAgain.body.data.item.status).toBe("paused");

    const resumed = await admin.post(`/api/subscriptions/${id}/resume`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.item.status).toBe("active");

    const resumedAgain = await admin.post(`/api/subscriptions/${id}/resume`);
    expect(resumedAgain.status).toBe(200);
    expect(resumedAgain.body.data.item.status).toBe("active");
  });

  it("moves the billing anchor when a pause extends the period", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;

    const now = Date.now();
    const shiftedEnd = new Date(
      Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        20,
      ),
    );

    if (shiftedEnd.getTime() <= now) {
      shiftedEnd.setUTCMonth(shiftedEnd.getUTCMonth() + 1);
    }

    await Subscription.findByIdAndUpdate(id, {
      status: "paused",
      pausedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      currentPeriodStart: new Date(now - 25 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: shiftedEnd,
      nextBillingAt: shiftedEnd,
      billingAnchorDay: 31,
    });

    const resumed = await admin.post(`/api/subscriptions/${id}/resume`);
    expect(resumed.status).toBe(200);

    const after = await Subscription.findById(id);
    const pauseDuration = after.resumedAt.getTime() - after.pausedAt.getTime();
    const expectedEnd = new Date(shiftedEnd.getTime() + pauseDuration);

    expect(after.currentPeriodEnd.getTime()).toBe(expectedEnd.getTime());
    expect(after.billingAnchorDay).toBe(expectedEnd.getUTCDate());

    const renewed = await admin.post(`/api/subscriptions/${id}/renew`);
    expect(renewed.status).toBe(200);

    const renewedSubscription = await Subscription.findById(id);
    expect(renewedSubscription.currentPeriodEnd.getTime()).toBe(
      addMonthsUTC(expectedEnd, 1).getTime(),
    );
  });

  it("schedules cancellation at period end and cancels immediately", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan, {
      startedAt: "2027-01-01T00:00:00.000Z",
    });
    const id = created.body.data.item._id;

    const scheduled = await admin
      .post(`/api/subscriptions/${id}/cancel`)
      .send({ atPeriodEnd: true, reason: "Budget review" });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.data.item).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
      cancellationReason: "Budget review",
    });
    expect(scheduled.body.data.item.canceledAt).toBeTruthy();

    const scheduledAgain = await admin
      .post(`/api/subscriptions/${id}/cancel`)
      .send({ atPeriodEnd: true });
    expect(scheduledAgain.status).toBe(200);
    expect(scheduledAgain.body.data.item.cancelAtPeriodEnd).toBe(true);

    const immediate = await admin
      .post(`/api/subscriptions/${id}/cancel`)
      .send({ atPeriodEnd: false, reason: "Now" });
    expect(immediate.status).toBe(200);
    expect(immediate.body.data.item.status).toBe("canceled");
    expect(immediate.body.data.item.cancelAtPeriodEnd).toBe(false);
    expect(immediate.body.data.item.endedAt).toBeTruthy();

    const repeated = await admin
      .post(`/api/subscriptions/${id}/cancel`)
      .send({ atPeriodEnd: false });
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.item.status).toBe("canceled");
  });

  it("rejects invalid transitions consistently", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;

    await admin.post(`/api/subscriptions/${id}/cancel`).send({});

    const renew = await admin.post(`/api/subscriptions/${id}/renew`);
    expect(renew.status).toBe(409);
    expect(renew.body.error.code).toBe("INVALID_TRANSITION");

    const pause = await admin.post(`/api/subscriptions/${id}/pause`);
    expect(pause.status).toBe(409);
    expect(pause.body.error.code).toBe("INVALID_TRANSITION");

    const anonymous = await request(app).post(`/api/subscriptions/${id}/pause`);
    expect(anonymous.status).toBe(401);
  });
});

describe("plan changes and proration", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("upgrades immediately and returns proration without creating a payment", async () => {
    const { admin, customer, plan } = await setup();
    const { plan: proPlan } = await createCatalog({
      productName: "Brightloop Pro",
      planName: "Pro",
      priceMinor: 250_000,
    });

    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;
    const now = Date.now();

    await Subscription.findByIdAndUpdate(id, {
      currentPeriodStart: new Date(now - 15 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now + 16 * 24 * 60 * 60 * 1000),
      nextBillingAt: new Date(now + 16 * 24 * 60 * 60 * 1000),
    });

    const response = await admin
      .post(`/api/subscriptions/${id}/upgrade`)
      .send({ plan: proPlan._id.toString(), quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.data.item).toMatchObject({
      plan: proPlan._id.toString(),
      priceMinor: 250_000,
      quantity: 2,
    });
    expect(response.body.data.proration.amountDueMinor).toBeGreaterThan(0);
    expect(response.body.data.proration.totalDueMinor).toBeGreaterThanOrEqual(
      response.body.data.proration.amountDueMinor,
    );

    const stored = await Subscription.findById(id);
    expect(stored.plan.toString()).toBe(proPlan._id.toString());
  });

  it("starts a new billing period when the plan changes cycle", async () => {
    const { admin, customer, plan } = await setup();
    const { plan: yearlyPlan } = await createCatalog({
      productName: "Brightloop Annual",
      planName: "Annual",
      billingCycle: "yearly",
      priceMinor: 1_200_000,
    });

    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;
    const before = await Subscription.findById(id);

    const response = await admin
      .post(`/api/subscriptions/${id}/upgrade`)
      .send({ plan: yearlyPlan._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body.data.item.billingCycle).toBe("yearly");
    expect(response.body.data.proration.cycleChanged).toBe(true);
    expect(response.body.data.proration.amountDueMinor).toBeGreaterThan(0);

    const after = await Subscription.findById(id);
    expect(after.currentPeriodStart.getTime()).toBeGreaterThan(
      before.currentPeriodStart.getTime(),
    );
    expect(after.currentPeriodEnd.getTime()).toBeGreaterThan(
      before.currentPeriodEnd.getTime(),
    );
  });

  it("supports prorated quantity changes on the same plan", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;
    const now = Date.now();

    await Subscription.findByIdAndUpdate(id, {
      currentPeriodStart: new Date(now - 15 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now + 16 * 24 * 60 * 60 * 1000),
      nextBillingAt: new Date(now + 16 * 24 * 60 * 60 * 1000),
    });

    const response = await admin
      .post(`/api/subscriptions/${id}/upgrade`)
      .send({ plan: plan._id.toString(), quantity: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data.item.quantity).toBe(3);
    expect(response.body.data.proration.amountDueMinor).toBeGreaterThan(0);
  });

  it("downgrades with credit and never returns a negative amount due", async () => {
    const { admin, customer, plan } = await setup();
    const { plan: proPlan } = await createCatalog({
      productName: "Brightloop Pro",
      planName: "Pro",
      priceMinor: 250_000,
    });

    const created = await createViaApi(admin, customer, proPlan);
    const id = created.body.data.item._id;
    const now = Date.now();

    await Subscription.findByIdAndUpdate(id, {
      currentPeriodStart: new Date(now - 15 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now + 16 * 24 * 60 * 60 * 1000),
      nextBillingAt: new Date(now + 16 * 24 * 60 * 60 * 1000),
    });

    const response = await admin
      .post(`/api/subscriptions/${id}/downgrade`)
      .send({ plan: plan._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body.data.item.plan).toBe(plan._id.toString());
    expect(response.body.data.proration.amountDueMinor).toBe(0);
    expect(response.body.data.proration.creditMinor).toBeGreaterThan(0);
  });

  it("rejects wrong direction, unchanged plans and plan changes while paused", async () => {
    const { admin, customer, plan } = await setup();
    const { plan: proPlan } = await createCatalog({
      productName: "Brightloop Pro",
      planName: "Pro",
      priceMinor: 250_000,
    });

    const created = await createViaApi(admin, customer, proPlan);
    const id = created.body.data.item._id;

    const wrongUpgrade = await admin
      .post(`/api/subscriptions/${id}/upgrade`)
      .send({ plan: plan._id.toString() });
    expect(wrongUpgrade.status).toBe(422);
    expect(wrongUpgrade.body.error.code).toBe("INVALID_PLAN_CHANGE");

    const unchanged = await admin
      .post(`/api/subscriptions/${id}/upgrade`)
      .send({ plan: proPlan._id.toString() });
    expect(unchanged.status).toBe(409);
    expect(unchanged.body.error.code).toBe("PLAN_UNCHANGED");

    await admin.post(`/api/subscriptions/${id}/pause`);
    const pausedUpgrade = await admin
      .post(`/api/subscriptions/${id}/upgrade`)
      .send({ plan: plan._id.toString() });
    expect(pausedUpgrade.status).toBe(409);
    expect(pausedUpgrade.body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("renewal, past-due and expiration actions", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("renews one period and reports the invoice", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);

    const response = await admin.post(
      `/api/subscriptions/${created.body.data.item._id}/renew`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.renewal.renewed).toBe(true);
    expect(response.body.data.invoice).toBeTruthy();
    expect(response.body.data.invoice.status).toBe("open");
    expect(response.body.data.item.currentPeriodStart).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(response.body.data.item.currentPeriodEnd).toBe(
      "2026-03-31T00:00:00.000Z",
    );
  });

  it("marks past due, reactivates and expires idempotently", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;

    const pastDue = await admin.post(`/api/subscriptions/${id}/past-due`);
    expect(pastDue.status).toBe(200);
    expect(pastDue.body.data.item.status).toBe("past_due");
    expect(pastDue.body.data.item.pastDueAt).toBeTruthy();

    const pastDueAgain = await admin.post(`/api/subscriptions/${id}/past-due`);
    expect(pastDueAgain.status).toBe(200);
    expect(pastDueAgain.body.data.item.status).toBe("past_due");

    const reactivated = await admin.post(`/api/subscriptions/${id}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data.item.status).toBe("active");

    const expired = await admin.post(`/api/subscriptions/${id}/expire`);
    expect(expired.status).toBe(200);
    expect(expired.body.data.item.status).toBe("expired");
    expect(expired.body.data.item.endedAt).toBeTruthy();

    const expiredAgain = await admin.post(`/api/subscriptions/${id}/expire`);
    expect(expiredAgain.status).toBe(200);
    expect(expiredAgain.body.data.item.status).toBe("expired");
  });

  it("validates ids and strict action payloads", async () => {
    const { admin, customer, plan } = await setup();
    const created = await createViaApi(admin, customer, plan);
    const id = created.body.data.item._id;

    const invalidId = await admin.get("/api/subscriptions/not-an-id");
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("INVALID_IDENTIFIER");

    const missing = await admin.get("/api/subscriptions/000000000000000000000000");
    expect(missing.status).toBe(404);

    const invalidCancel = await admin
      .post(`/api/subscriptions/${id}/cancel`)
      .send({ atPeriodEnd: "yes", unknown: true });
    expect(invalidCancel.status).toBe(422);
    expect(invalidCancel.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("subscription listing", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it("filters, searches and paginates subscriptions", async () => {
    const { admin, customer, plan } = await setup();
    const { plan: otherPlan } = await createCatalog({
      productName: "Brightloop Other",
      planName: "Other",
      priceMinor: 200_000,
    });

    await createViaApi(admin, customer, plan);
    await createViaApi(admin, customer, otherPlan);
    await admin.post("/api/subscriptions").send({
      customer: customer._id.toString(),
      plan: plan._id.toString(),
    });

    const filtered = await admin.get("/api/subscriptions?status=active&limit=1");
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.meta.total).toBe(2);

    const searched = await admin.get("/api/subscriptions?search=acme");
    expect(searched.status).toBe(200);
    expect(searched.body.meta.total).toBe(2);

    const pastDue = await admin.get("/api/subscriptions/past-due");
    expect(pastDue.status).toBe(200);
    expect(pastDue.body.data.items).toHaveLength(0);
  });
});
