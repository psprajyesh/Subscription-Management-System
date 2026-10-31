import { BILLING_CYCLE_MONTHS } from "../config/constants.js";
import { addMonthsUTC, remainingPeriodFraction } from "../utils/dates.js";

/**
 * All amounts are integer paise. Rounding is deliberately centralised here:
 * every monetary result uses Math.round exactly once at its boundary, so the
 * same inputs always produce the same result regardless of call order.
 */

export function cycleMonths(billingCycle) {
  return BILLING_CYCLE_MONTHS[billingCycle] ?? 1;
}

export function calculatePeriodEnd(periodStart, billingCycle, anchorDay = null) {
  const end = addMonthsUTC(periodStart, cycleMonths(billingCycle));

  if (!anchorDay) return end;

  const day = Math.min(
    31,
    Math.max(1, Math.round(Number(anchorDay) || end.getUTCDate())),
  );
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      Math.min(day, lastDay),
      end.getUTCHours(),
      end.getUTCMinutes(),
      end.getUTCSeconds(),
      end.getUTCMilliseconds(),
    ),
  );
}

export function calculateProrationFraction(periodStart, periodEnd, at = new Date()) {
  return remainingPeriodFraction(periodStart, periodEnd, at);
}

export function calculateDiscountMinor({
  subtotalMinor,
  discountType = null,
  discountValue = 0,
  fraction = 1,
} = {}) {
  const subtotal = Math.max(0, Math.round(Number(subtotalMinor) || 0));
  const value = Math.max(0, Number(discountValue) || 0);
  const proration = Math.min(1, Math.max(0, Number(fraction) || 0));

  if (!discountType || value <= 0 || subtotal <= 0 || proration <= 0) {
    return 0;
  }

  const discount =
    discountType === "percentage"
      ? Math.round((subtotal * value) / 100)
      : Math.round(value * proration);

  return Math.max(0, Math.min(subtotal, discount));
}

/**
 * Calculates one invoice/period line in paise. A discount can never make the
 * payable amount negative, and a fixed discount is prorated with the period.
 */
export function calculateCharge({
  priceMinor,
  quantity = 1,
  discountType = null,
  discountValue = 0,
  fraction = 1,
  taxRateBasisPoints = 0,
} = {}) {
  const safePrice = Math.max(0, Math.round(Number(priceMinor) || 0));
  const safeQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  const proration = Math.min(1, Math.max(0, Number(fraction) || 0));

  const grossMinor = Math.round(safePrice * safeQuantity * proration);
  const discountMinor = calculateDiscountMinor({
    subtotalMinor: grossMinor,
    discountType,
    discountValue,
    fraction: proration,
  });
  const netMinor = Math.max(0, grossMinor - discountMinor);
  const taxMinor = Math.max(
    0,
    Math.round((netMinor * Math.max(0, Number(taxRateBasisPoints) || 0)) / 10_000),
  );

  return {
    grossMinor,
    discountMinor,
    netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
  };
}

/**
 * Discounts have three lifetimes. A "once" discount is consumed by the first
 * invoice that grants it. A "repeating" discount expires after a number of
 * calendar months, which keeps monthly, quarterly and yearly plans consistent
 * (an invoice count would make a 3-month discount last three years on a yearly
 * plan). Legacy snapshots without `discountStartedAt` fall back to the invoice
 * count.
 */
export function isDiscountApplicable(subscription, at = new Date()) {
  if (!subscription?.discountType || subscription.discountValue == null) {
    return false;
  }

  if (
    subscription.discountValidUntil &&
    new Date(subscription.discountValidUntil).getTime() <= new Date(at).getTime()
  ) {
    return false;
  }

  const applications = Math.max(0, Number(subscription.discountApplications) || 0);

  if (subscription.discountDuration === "once") {
    return applications < 1;
  }

  if (subscription.discountDuration === "repeating") {
    const durationMonths = Math.max(
      1,
      Number(subscription.discountDurationMonths) || 1,
    );
    const startedAt =
      subscription.discountStartedAt ??
      subscription.createdAt ??
      subscription.startedAt;

    if (startedAt && !Number.isNaN(new Date(startedAt).getTime())) {
      return (
        new Date(at).getTime() <
        addMonthsUTC(startedAt, durationMonths).getTime()
      );
    }

    return applications < durationMonths;
  }

  return true;
}

export function activeDiscountTerms(subscription, at = new Date()) {
  if (!isDiscountApplicable(subscription, at)) {
    return { discountType: null, discountValue: 0 };
  }

  return {
    discountType: subscription.discountType,
    discountValue: subscription.discountValue,
  };
}

/**
 * Converts a subscription's net charge for its billing cycle into a monthly
 * amount. Fixed discounts are divided across the cycle exactly like net plan
 * revenue; percentage discounts therefore normalise consistently across
 * monthly, quarterly and yearly plans.
 */
export function normalizeMonthlyRecurringMinor({
  priceMinor,
  quantity = 1,
  discountType = null,
  discountValue = 0,
  billingCycle = "monthly",
} = {}) {
  const months = cycleMonths(billingCycle);
  const grossMinor = Math.max(
    0,
    Math.round((Number(priceMinor) || 0) * Math.max(1, Number(quantity) || 1)),
  );
  const discountMinor = calculateDiscountMinor({
    subtotalMinor: grossMinor,
    discountType,
    discountValue,
  });
  const netMinor = Math.max(0, grossMinor - discountMinor);

  return Math.round(netMinor / months);
}

/**
 * Immediate plan changes keep the current billing anchor and credit the unused
 * fraction of the old plan while charging the same fraction of the new plan.
 * The response never contains a negative payable amount: an excess credit is
 * returned separately and is intentionally not carried forward yet.
 */
export function calculateProration({
  currentSubscription,
  targetPlan,
  quantity = currentSubscription.quantity,
  discountType = null,
  discountValue = 0,
  now = new Date(),
  taxRateBasisPoints = currentSubscription.taxRateBasisPoints ?? 0,
} = {}) {
  const fraction = calculateProrationFraction(
    currentSubscription.currentPeriodStart,
    currentSubscription.currentPeriodEnd,
    now,
  );

  const currentCharge = calculateCharge({
    priceMinor: currentSubscription.priceMinor,
    quantity: currentSubscription.quantity,
    discountType,
    discountValue,
    fraction,
    taxRateBasisPoints,
  });

  const targetCharge = calculateCharge({
    priceMinor: targetPlan.priceMinor,
    quantity,
    discountType,
    discountValue,
    fraction,
    taxRateBasisPoints,
  });

  const amountDueMinor = Math.max(0, targetCharge.netMinor - currentCharge.netMinor);
  const creditMinor = Math.max(0, currentCharge.netMinor - targetCharge.netMinor);
  const taxOnAmountDueMinor = Math.max(
    0,
    Math.round((amountDueMinor * Math.max(0, Number(taxRateBasisPoints) || 0)) / 10_000),
  );

  return {
    periodStart: currentSubscription.currentPeriodStart,
    periodEnd: currentSubscription.currentPeriodEnd,
    remainingFraction: fraction,
    currentCreditMinor: currentCharge.netMinor,
    targetChargeMinor: targetCharge.netMinor,
    amountDueMinor,
    creditMinor,
    taxOnAmountDueMinor,
    totalDueMinor: amountDueMinor + taxOnAmountDueMinor,
  };
}

/**
 * When the billing cycle itself changes (for example monthly -> yearly), the
 * target plan cannot be meaningfully prorated over the old cycle's fraction.
 * Credit the unused old period and start a full target cycle from now instead.
 */
export function calculateCycleChangeProration({
  currentSubscription,
  targetPlan,
  quantity = currentSubscription.quantity,
  discountType = null,
  discountValue = 0,
  now = new Date(),
  taxRateBasisPoints = currentSubscription.taxRateBasisPoints ?? 0,
} = {}) {
  const fraction = calculateProrationFraction(
    currentSubscription.currentPeriodStart,
    currentSubscription.currentPeriodEnd,
    now,
  );

  const currentCharge = calculateCharge({
    priceMinor: currentSubscription.priceMinor,
    quantity: currentSubscription.quantity,
    discountType,
    discountValue,
    fraction,
    taxRateBasisPoints,
  });

  const targetCharge = calculateCharge({
    priceMinor: targetPlan.priceMinor,
    quantity,
    discountType,
    discountValue,
    fraction: 1,
    taxRateBasisPoints,
  });

  const amountDueMinor = Math.max(0, targetCharge.netMinor - currentCharge.netMinor);
  const creditMinor = Math.max(0, currentCharge.netMinor - targetCharge.netMinor);
  const taxOnAmountDueMinor = Math.max(
    0,
    Math.round((amountDueMinor * Math.max(0, Number(taxRateBasisPoints) || 0)) / 10_000),
  );

  return {
    periodStart: now,
    periodEnd: calculatePeriodEnd(now, targetPlan.billingCycle, now.getUTCDate()),
    remainingFraction: fraction,
    currentCreditMinor: currentCharge.netMinor,
    targetChargeMinor: targetCharge.netMinor,
    amountDueMinor,
    creditMinor,
    taxOnAmountDueMinor,
    totalDueMinor: amountDueMinor + taxOnAmountDueMinor,
    cycleChanged: true,
  };
}
