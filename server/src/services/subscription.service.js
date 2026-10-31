import {
  Customer,
  Discount,
  Invoice,
  Plan,
  Product,
  Settings,
  Subscription,
  Tax,
} from "../models/index.js";
import { BLOCKING_SUBSCRIPTION_STATUSES } from "../config/constants.js";
import { AppError } from "../utils/AppError.js";
import { addDaysUTC, addMilliseconds } from "../utils/dates.js";
import {
  buildListQuery,
  escapeRegex,
  executeList,
} from "../utils/queryBuilder.js";
import {
  activeDiscountTerms,
  calculateCycleChangeProration,
  calculatePeriodEnd,
  calculateProration,
  calculateProrationFraction,
  isDiscountApplicable,
  normalizeMonthlyRecurringMinor,
} from "./billing.service.js";
import { createRenewalInvoice } from "./invoice.service.js";
import {
  assertTransition,
  RENEWABLE_STATUSES,
} from "./subscriptionState.js";
import { recordAudit } from "./audit.service.js";

const SEARCH_FIELDS = [];
const FILTERS = {
  status: { field: "status" },
  customer: { field: "customer" },
  plan: { field: "plan" },
  billingCycle: { field: "billingCycle" },
  cancelAtPeriodEnd: { field: "cancelAtPeriodEnd" },
};

function invalidTransition(from, to, action) {
  return new AppError(`Cannot ${action} a subscription in status "${from}"`, {
    statusCode: 409,
    code: "INVALID_TRANSITION",
    details: { from, to, action },
  });
}

function duplicateSubscriptionError() {
  return new AppError(
    "An active subscription already exists for this customer and plan",
    { statusCode: 409, code: "DUPLICATE_SUBSCRIPTION" },
  );
}

function discountUnavailableError(message = "Discount code is unavailable") {
  return new AppError(message, {
    statusCode: 422,
    code: "DISCOUNT_UNAVAILABLE",
  });
}

async function releaseDiscountClaim(discount) {
  if (!discount?._id) return;
  try {
    await Discount.updateOne({ _id: discount._id }, { $inc: { timesRedeemed: -1 } });
  } catch {
    // A failed redemption counter rollback must never mask the original error.
  }
}

export async function getSubscription(subscriptionId) {
  const subscription = await Subscription.findById(subscriptionId);

  if (!subscription) {
    throw AppError.notFound("Subscription not found");
  }

  return subscription;
}

async function ensureCustomerAvailable(customerId) {
  const customer = await Customer.findById(customerId);

  if (!customer || customer.status !== "active") {
    throw new AppError("Customer is unavailable for a new subscription", {
      statusCode: 422,
      code: "CUSTOMER_UNAVAILABLE",
    });
  }

  return customer;
}

async function ensurePlanAvailable(planId) {
  const plan = await Plan.findById(planId);

  if (!plan || plan.status !== "active") {
    throw new AppError("Plan is unavailable for subscriptions", {
      statusCode: 422,
      code: "PLAN_UNAVAILABLE",
    });
  }

  const product = await Product.findById(plan.product);

  if (!product || product.status !== "active") {
    throw new AppError("Plan product is unavailable for subscriptions", {
      statusCode: 422,
      code: "PLAN_UNAVAILABLE",
    });
  }

  return plan;
}

async function defaultTaxRate() {
  const settings = await Settings.getSingleton();

  if (settings.defaultTax) {
    const tax = await Tax.findOne({
      _id: settings.defaultTax,
      status: "active",
    });

    if (tax) return tax.rateBasisPoints;
  }

  // No configured workspace tax means no tax is added. The seed/workspace can
  // opt into a default tax through Settings.
  return 0;
}

async function resolveDiscount({ code, plan, quantity, grossMinor, now = new Date() }) {
  const discount = await Discount.findOne({ code: String(code).toUpperCase() });

  if (!discount || discount.status !== "active") {
    throw discountUnavailableError();
  }

  if (discount.validFrom && discount.validFrom.getTime() > now.getTime()) {
    throw discountUnavailableError("Discount code is not active yet");
  }

  if (discount.validUntil && discount.validUntil.getTime() <= now.getTime()) {
    throw discountUnavailableError("Discount code has expired");
  }

  if (discount.minAmountMinor > grossMinor) {
    throw discountUnavailableError(
      "Subscription amount does not meet the discount minimum",
    );
  }

  if (
    discount.appliesToProducts.length > 0 &&
    !discount.appliesToProducts.some(
      (productId) => String(productId) === String(plan.product),
    )
  ) {
    throw discountUnavailableError("Discount code does not apply to this product");
  }

  if (
    discount.appliesToPlans.length > 0 &&
    !discount.appliesToPlans.some((planId) => String(planId) === String(plan._id))
  ) {
    throw discountUnavailableError("Discount code does not apply to this plan");
  }

  const claimed = await Discount.findOneAndUpdate(
    {
      _id: discount._id,
      status: "active",
      $or: [
        { maxRedemptions: null },
        { $expr: { $lt: ["$timesRedeemed", "$maxRedemptions"] } },
      ],
    },
    { $inc: { timesRedeemed: 1 } },
    { returnDocument: "after" },
  );

  if (!claimed) {
    throw discountUnavailableError("Discount redemption limit reached");
  }

  return claimed;
}

function discountSnapshot(discount, startedAt = null) {
  return {
    discount: discount?._id ?? null,
    discountCode: discount?.code ?? "",
    discountType: discount?.type ?? null,
    discountValue: discount?.value ?? null,
    discountDuration: discount?.duration ?? null,
    discountDurationMonths: discount?.durationMonths ?? null,
    discountApplications: 0,
    discountValidUntil: discount?.validUntil ?? null,
    discountStartedAt: discount ? startedAt ?? new Date() : null,
  };
}

async function buildSearchCondition(search) {
  if (!search) return null;

  const pattern = escapeRegex(search);
  const [customers, plans] = await Promise.all([
    Customer.find({
      $or: [
        { name: { $regex: pattern, $options: "i" } },
        { email: { $regex: pattern, $options: "i" } },
        { company: { $regex: pattern, $options: "i" } },
      ],
    })
      .select("_id")
      .lean(),
    Plan.find({ name: { $regex: pattern, $options: "i" } })
      .select("_id")
      .lean(),
  ]);

  return {
    $or: [
      { customer: { $in: customers.map((customer) => customer._id) } },
      { plan: { $in: plans.map((plan) => plan._id) } },
    ],
  };
}

export async function listSubscriptions(query, _user) {
  const { filter, sort, page, limit, skip } = buildListQuery(query, {
    searchFields: SEARCH_FIELDS,
    filters: FILTERS,
  });

  const searchCondition = await buildSearchCondition(query.search);
  const finalFilter = searchCondition ? { ...filter, ...searchCondition } : filter;

  return executeList(Subscription, {
    filter: finalFilter,
    sort,
    page,
    limit,
    skip,
  });
}

export async function createSubscription(payload, user, req) {
  const customer = await ensureCustomerAvailable(payload.customer);
  const plan = await ensurePlanAvailable(payload.plan);
  const quantity = payload.quantity ?? 1;
  const startedAt = payload.startedAt ? new Date(payload.startedAt) : new Date();
  const now = new Date();

  const duplicate = await Subscription.exists({
    customer: customer._id,
    plan: plan._id,
    status: { $in: BLOCKING_SUBSCRIPTION_STATUSES },
  });

  if (duplicate) {
    throw duplicateSubscriptionError();
  }

  const trialRequested = Boolean(payload.startTrial);

  if (trialRequested && plan.trialDays < 1) {
    throw new AppError("This plan does not offer a trial", {
      statusCode: 422,
      code: "TRIAL_NOT_AVAILABLE",
    });
  }

  const trialEndsAt = trialRequested
    ? addDaysUTC(startedAt, plan.trialDays)
    : null;
  const currentPeriodEnd = trialRequested
    ? trialEndsAt
    : calculatePeriodEnd(startedAt, plan.billingCycle);

  let claimedDiscount = null;

  try {
    if (payload.discountCode) {
      claimedDiscount = await resolveDiscount({
        code: payload.discountCode,
        plan,
        quantity,
        grossMinor: plan.priceMinor * quantity,
        now,
      });
    }

    const subscription = await Subscription.create({
      customer: customer._id,
      plan: plan._id,
      status: trialRequested ? "trialing" : "active",
      quantity,
      priceMinor: plan.priceMinor,
      billingCycle: plan.billingCycle,
      billingAnchorDay: startedAt.getUTCDate(),
      currency: plan.currency,
      ...discountSnapshot(claimedDiscount, now),
      taxRateBasisPoints: await defaultTaxRate(),
      startedAt,
      trialEndsAt,
      currentPeriodStart: startedAt,
      currentPeriodEnd,
      nextBillingAt: currentPeriodEnd,
      createdBy: user._id,
    });

    await recordAudit({
      actor: user,
      action: "subscription.created",
      entityType: "Subscription",
      entityId: subscription._id,
      diff: {
        customer: customer._id,
        plan: plan._id,
        status: subscription.status,
        quantity,
        discountCode: subscription.discountCode || null,
      },
      req,
    });

    return subscription;
  } catch (error) {
    await releaseDiscountClaim(claimedDiscount);

    if (error?.code === 11000) {
      throw duplicateSubscriptionError();
    }

    throw error;
  }
}

export async function activateTrial(subscriptionId, user, req) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "active") {
    return subscription;
  }

  if (subscription.status !== "trialing") {
    throw invalidTransition(subscription.status, "active", "activate trial");
  }

  if (subscription.cancelAtPeriodEnd) {
    throw new AppError("A cancellation is already scheduled for this subscription", {
      statusCode: 409,
      code: "CANCEL_SCHEDULED",
    });
  }

  const now = new Date();
  const plan = await Plan.findById(subscription.plan);
  const billingCycle = subscription.billingCycle || plan?.billingCycle || "monthly";
  const currentPeriodEnd = calculatePeriodEnd(now, billingCycle);

  assertTransition(subscription.status, "active", "activate trial");

  subscription.status = "active";
  subscription.trialEndsAt = subscription.trialEndsAt ?? now;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = currentPeriodEnd;
  subscription.nextBillingAt = currentPeriodEnd;
  subscription.billingAnchorDay = now.getUTCDate();
  subscription.pastDueAt = null;

  await subscription.save();

  await recordAudit({
    actor: user,
    action: "subscription.trial_activated",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: { currentPeriodEnd },
    req,
  });

  return subscription;
}

export async function pauseSubscription(subscriptionId, user, req) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "paused") {
    return subscription;
  }

  assertTransition(subscription.status, "paused", "pause");

  const now = new Date();
  subscription.status = "paused";
  subscription.pausedAt = now;
  await subscription.save();

  await recordAudit({
    actor: user,
    action: "subscription.paused",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: { pausedAt: now },
    req,
  });

  return subscription;
}

export async function resumeSubscription(subscriptionId, user, req) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "active") {
    return subscription;
  }

  if (subscription.status !== "paused") {
    throw invalidTransition(subscription.status, "active", "resume");
  }

  assertTransition(subscription.status, "active", "resume");

  const now = new Date();
  const pauseDuration = subscription.pausedAt
    ? Math.max(0, now.getTime() - subscription.pausedAt.getTime())
    : 0;

  if (pauseDuration > 0) {
    subscription.currentPeriodStart = addMilliseconds(
      subscription.currentPeriodStart,
      pauseDuration,
    );
    subscription.currentPeriodEnd = addMilliseconds(
      subscription.currentPeriodEnd,
      pauseDuration,
    );
    subscription.nextBillingAt = addMilliseconds(
      subscription.nextBillingAt,
      pauseDuration,
    );
    if (subscription.trialEndsAt) {
      subscription.trialEndsAt = addMilliseconds(
        subscription.trialEndsAt,
        pauseDuration,
      );
    }

    // The pause moved the anniversary. Re-clamping to the old anchor day would
    // make the next period longer than one billing cycle.
    subscription.billingAnchorDay = subscription.currentPeriodEnd.getUTCDate();
  }

  subscription.status = "active";
  subscription.resumedAt = now;
  subscription.pastDueAt = null;
  await subscription.save();

  await recordAudit({
    actor: user,
    action: "subscription.resumed",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: { resumedAt: now, pauseDuration },
    req,
  });

  return subscription;
}

export async function cancelSubscription(
  subscriptionId,
  { atPeriodEnd = false, reason = "" },
  user,
  req,
) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "canceled") {
    return subscription;
  }

  if (subscription.status === "expired") {
    throw invalidTransition(subscription.status, "canceled", "cancel");
  }

  const now = new Date();
  const shouldCancelNow =
    !atPeriodEnd || new Date(subscription.currentPeriodEnd).getTime() <= now.getTime();

  if (!shouldCancelNow && subscription.cancelAtPeriodEnd) {
    return subscription;
  }

  subscription.canceledAt = now;
  subscription.cancellationReason = reason;

  if (shouldCancelNow) {
    subscription.status = "canceled";
    subscription.cancelAtPeriodEnd = false;
    subscription.endedAt = now;
  } else {
    subscription.cancelAtPeriodEnd = true;
  }

  await subscription.save();

  await recordAudit({
    actor: user,
    action: shouldCancelNow
      ? "subscription.canceled"
      : "subscription.cancel_scheduled",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: {
      atPeriodEnd: !shouldCancelNow,
      endedAt: shouldCancelNow ? now : subscription.currentPeriodEnd,
      reason: reason || null,
    },
    req,
  });

  return subscription;
}

export async function expireSubscription(subscriptionId, user, req) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "expired") {
    return subscription;
  }

  assertTransition(subscription.status, "expired", "expire");

  const now = new Date();
  subscription.status = "expired";
  subscription.endedAt = now;
  subscription.cancelAtPeriodEnd = false;
  await subscription.save();

  await recordAudit({
    actor: user,
    action: "subscription.expired",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: { endedAt: now },
    req,
  });

  return subscription;
}

export async function markSubscriptionPastDue(subscriptionId, user, req) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "past_due") {
    return subscription;
  }

  assertTransition(subscription.status, "past_due", "mark past due");

  const now = new Date();
  subscription.status = "past_due";
  subscription.pastDueAt = now;
  await subscription.save();

  await recordAudit({
    actor: user,
    action: "subscription.past_due",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: { pastDueAt: now },
    req,
  });

  return subscription;
}

export async function reactivateSubscription(subscriptionId, user, req) {
  const subscription = await getSubscription(subscriptionId);

  if (subscription.status === "active") {
    return subscription;
  }

  if (subscription.status !== "past_due") {
    throw invalidTransition(subscription.status, "active", "reactivate");
  }

  assertTransition(subscription.status, "active", "reactivate");

  subscription.status = "active";
  subscription.pastDueAt = null;
  await subscription.save();

  await recordAudit({
    actor: user,
    action: "subscription.reactivated",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: { recovered: true },
    req,
  });

  return subscription;
}

/**
 * Advances exactly one billing period and creates at most one invoice.
 *
 * The optimistic filter on currentPeriodEnd/nextBillingAt is the concurrency
 * guard: two workers that loaded the same due subscription may both reach this
 * point, but only one update can match. The other worker treats the request as
 * already processed.
 */
export async function renewSubscription(
  subscriptionId,
  { actor = null, req = null, now = new Date(), requireDue = false } = {},
) {
  const subscription = await getSubscription(subscriptionId);

  if (!RENEWABLE_STATUSES.includes(subscription.status)) {
    throw invalidTransition(subscription.status, "active", "renew");
  }

  if (subscription.cancelAtPeriodEnd) {
    throw new AppError("A cancellation is scheduled for this subscription", {
      statusCode: 409,
      code: "CANCEL_SCHEDULED",
    });
  }

  if (requireDue && new Date(subscription.nextBillingAt).getTime() > now.getTime()) {
    return {
      renewed: false,
      reason: "not_due",
      subscription,
      invoice: null,
    };
  }

  const plan = await Plan.findById(subscription.plan);
  const billingCycle = subscription.billingCycle || plan?.billingCycle || "monthly";
  const anchorDay =
    subscription.billingAnchorDay ||
    new Date(subscription.startedAt).getUTCDate();
  const periodStart = new Date(subscription.currentPeriodEnd);
  const periodEnd = calculatePeriodEnd(periodStart, billingCycle, anchorDay);

  const invoiceResult = await createRenewalInvoice({
    subscription,
    plan,
    periodStart,
    periodEnd,
    issuedAt: now,
  });

  // Do not write `status` here. A concurrent past-due/reactivation update must
  // not be overwritten by a status derived from this worker's stale snapshot.
  // The filter below already guarantees the subscription is still renewable.
  const update = {
    $set: {
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
      billingCycle,
      billingAnchorDay: anchorDay,
      lastRenewedAt: now,
    },
  };

  const invoiceGrantedDiscount =
    invoiceResult.created ||
    ((invoiceResult.invoice?.discountMinor ?? 0) > 0 &&
      invoiceResult.invoice?.status !== "void");

  if (invoiceResult.discountApplied && invoiceGrantedDiscount) {
    update.$inc = { discountApplications: 1 };
  }

  const updated = await Subscription.findOneAndUpdate(
    {
      _id: subscription._id,
      status: { $in: RENEWABLE_STATUSES },
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextBillingAt: subscription.nextBillingAt,
      cancelAtPeriodEnd: { $ne: true },
    },
    update,
    { returnDocument: "after" },
  );

  if (!updated) {
    const latest = await Subscription.findById(subscription._id);

    // Another worker may have renewed this exact period already. In that case
    // the invoice is valid even if the subscription was cancelled afterwards.
    // Only void an invoice this worker created when the renewal did not take
    // effect (cancelled, paused or ended before the update), or when a
    // concurrent worker also managed to create one for the same period (a
    // defensive fallback for a deployment where the unique index is missing).
    const renewalApplied =
      latest &&
      latest.currentPeriodStart?.getTime() === periodStart.getTime() &&
      latest.currentPeriodEnd?.getTime() === periodEnd.getTime();

    const duplicateInvoice =
      invoiceResult.created && renewalApplied
        ? await Invoice.exists({
            _id: { $ne: invoiceResult.invoice._id },
            subscription: subscription._id,
            billingPeriodStart: periodStart,
          })
        : null;

    if (
      invoiceResult.created &&
      latest &&
      (duplicateInvoice ||
        (!renewalApplied &&
          (latest.cancelAtPeriodEnd ||
            !RENEWABLE_STATUSES.includes(latest.status))))
    ) {
      const voided = await Invoice.updateOne(
        { _id: invoiceResult.invoice._id, status: "open" },
        { $set: { status: "void", voidedAt: now } },
      );

      if (voided.modifiedCount > 0) {
        await recordAudit({
          actor: null,
          action: "invoice.voided",
          entityType: "Invoice",
          entityId: invoiceResult.invoice._id,
          diff: { reason: "renewal_not_applied", periodStart, periodEnd },
          req,
        });
      }
    }

    return {
      renewed: false,
      reason: "already_processed",
      subscription: latest,
      invoice: invoiceResult.invoice,
    };
  }

  await recordAudit({
    actor,
    action: "subscription.renewed",
    entityType: "Subscription",
    entityId: updated._id,
    diff: {
      periodStart,
      periodEnd,
      invoice: invoiceResult.invoice?._id ?? null,
      auto: actor === null,
    },
    req,
  });

  return {
    renewed: true,
    subscription: updated,
    invoice: invoiceResult.invoice,
    discountApplied: invoiceResult.discountApplied,
  };
}

export async function changeSubscriptionPlan(
  subscriptionId,
  { plan: targetPlanId, quantity },
  mode,
  user,
  req,
) {
  const subscription = await getSubscription(subscriptionId);

  if (["paused", "canceled", "expired"].includes(subscription.status)) {
    throw invalidTransition(
      subscription.status,
      subscription.status,
      mode === "upgrade" ? "upgrade" : "downgrade",
    );
  }

  const targetPlan = await ensurePlanAvailable(targetPlanId);

  const currentPlan = await Plan.findById(subscription.plan);
  const currentCycle = subscription.billingCycle || currentPlan?.billingCycle || "monthly";
  const newQuantity = quantity ?? subscription.quantity;
  const now = new Date();
  const terms = activeDiscountTerms(subscription, now);

  const currentMonthly = normalizeMonthlyRecurringMinor({
    priceMinor: subscription.priceMinor,
    quantity: subscription.quantity,
    discountType: terms.discountType,
    discountValue: terms.discountValue,
    billingCycle: currentCycle,
  });

  const targetMonthly = normalizeMonthlyRecurringMinor({
    priceMinor: targetPlan.priceMinor,
    quantity: newQuantity,
    discountType: terms.discountType,
    discountValue: terms.discountValue,
    billingCycle: targetPlan.billingCycle,
  });

  if (mode === "upgrade" && targetMonthly < currentMonthly) {
    throw new AppError("Target plan is not an upgrade", {
      statusCode: 422,
      code: "INVALID_PLAN_CHANGE",
      details: { currentMonthlyMinor: currentMonthly, targetMonthlyMinor: targetMonthly },
    });
  }

  if (mode === "downgrade" && targetMonthly > currentMonthly) {
    throw new AppError("Target plan is not a downgrade", {
      statusCode: 422,
      code: "INVALID_PLAN_CHANGE",
      details: { currentMonthlyMinor: currentMonthly, targetMonthlyMinor: targetMonthly },
    });
  }

  if (
    String(subscription.plan) === String(targetPlan._id) &&
    newQuantity === subscription.quantity
  ) {
    throw new AppError("Subscription is already on this plan and quantity", {
      statusCode: 409,
      code: "PLAN_UNCHANGED",
    });
  }

  if (subscription.discount) {
    const discount = await Discount.findOne({ _id: subscription.discount }).setOptions({
      withDeleted: true,
    });

    if (discount) {
      const productMismatch =
        discount.appliesToProducts.length > 0 &&
        !discount.appliesToProducts.some(
          (productId) => String(productId) === String(targetPlan.product),
        );
      const planMismatch =
        discount.appliesToPlans.length > 0 &&
        !discount.appliesToPlans.some(
          (planId) => String(planId) === String(targetPlan._id),
        );

      if (productMismatch || planMismatch) {
        throw new AppError("Discount does not apply to the target plan", {
          statusCode: 422,
          code: "DISCOUNT_NOT_APPLICABLE",
        });
      }
    }
  }

  let proration;
  const cycleChanged = currentCycle !== targetPlan.billingCycle;

  if (subscription.status === "trialing") {
    proration = {
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      remainingFraction: calculateProrationFraction(
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        now,
      ),
      currentCreditMinor: 0,
      targetChargeMinor: 0,
      amountDueMinor: 0,
      creditMinor: 0,
      taxOnAmountDueMinor: 0,
      totalDueMinor: 0,
      cycleChanged,
      trial: true,
    };
  } else if (cycleChanged) {
    proration = calculateCycleChangeProration({
      currentSubscription: subscription,
      targetPlan,
      quantity: newQuantity,
      discountType: terms.discountType,
      discountValue: terms.discountValue,
      now,
      taxRateBasisPoints: subscription.taxRateBasisPoints ?? 0,
    });
  } else {
    proration = calculateProration({
      currentSubscription: subscription,
      targetPlan,
      quantity: newQuantity,
      discountType: terms.discountType,
      discountValue: terms.discountValue,
      now,
      taxRateBasisPoints: subscription.taxRateBasisPoints ?? 0,
    });
  }

  subscription.plan = targetPlan._id;
  subscription.priceMinor = targetPlan.priceMinor;
  subscription.billingCycle = targetPlan.billingCycle;
  subscription.quantity = newQuantity;

  if (cycleChanged && subscription.status !== "trialing") {
    subscription.currentPeriodStart = proration.periodStart;
    subscription.currentPeriodEnd = proration.periodEnd;
    subscription.nextBillingAt = proration.periodEnd;
    subscription.billingAnchorDay = now.getUTCDate();
  }

  try {
    await subscription.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw duplicateSubscriptionError();
    }
    throw error;
  }

  await recordAudit({
    actor: user,
    action: "subscription.plan_changed",
    entityType: "Subscription",
    entityId: subscription._id,
    diff: {
      mode,
      fromPlan: currentPlan?._id ?? null,
      toPlan: targetPlan._id,
      quantity: newQuantity,
      amountDueMinor: proration.amountDueMinor,
      creditMinor: proration.creditMinor,
    },
    req,
  });

  return { subscription, proration };
}

export { isDiscountApplicable };
