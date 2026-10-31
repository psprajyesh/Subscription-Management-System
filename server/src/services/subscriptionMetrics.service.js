import { Subscription } from "../models/index.js";
import { startOfUTCMonth } from "../utils/dates.js";
import {
  isDiscountApplicable,
  normalizeMonthlyRecurringMinor,
} from "./billing.service.js";

function percent(value, digits = 2) {
  return Number((value * 100).toFixed(digits));
}

/**
 * Recurring-revenue metrics in integer paise.
 *
 * MRR includes active and past-due subscriptions because both still represent
 * contracted recurring revenue. Trials, paused, canceled and expired
 * subscriptions are excluded. Each subscription is normalised to a monthly
 * value so monthly/quarterly/yearly plans are comparable and fixed discounts
 * are spread consistently across the cycle.
 */
export async function getSubscriptionMetrics({ from, to, now = new Date() } = {}) {
  const periodTo = to ? new Date(to) : now;
  const periodFrom = from ? new Date(from) : startOfUTCMonth(periodTo);

  const subscriptions = await Subscription.find({
    status: { $in: ["active", "past_due"] },
    // A future-dated subscription has not started yet and must not inflate
    // MRR/ARR before its first period begins.
    startedAt: { $lte: now },
  })
    .populate({ path: "plan", select: "billingCycle priceMinor" })
    .lean();

  let mrrMinor = 0;

  for (const subscription of subscriptions) {
    const billingCycle =
      subscription.billingCycle || subscription.plan?.billingCycle || "monthly";
    const discountActive = isDiscountApplicable(subscription, now);

    mrrMinor += normalizeMonthlyRecurringMinor({
      priceMinor: subscription.priceMinor ?? subscription.plan?.priceMinor ?? 0,
      quantity: subscription.quantity ?? 1,
      discountType: discountActive ? subscription.discountType : null,
      discountValue: discountActive ? subscription.discountValue : 0,
      billingCycle,
    });
  }

  const [activeSubscriptions, pastDueSubscriptions, activeAtPeriodStart, canceledInPeriod] =
    await Promise.all([
      Subscription.countDocuments({
        status: "active",
        startedAt: { $lte: now },
      }),
      Subscription.countDocuments({
        status: "past_due",
        startedAt: { $lte: now },
      }),
      Subscription.countDocuments({
        startedAt: { $lt: periodFrom },
        status: { $in: ["trialing", "active", "past_due", "paused", "canceled", "expired"] },
        $or: [{ endedAt: null }, { endedAt: { $gte: periodFrom } }],
      }),
      Subscription.countDocuments({
        status: "canceled",
        // Churn is measured against the base that existed at the start of the
        // period. A subscription created and cancelled inside the same period
        // is new-business churn and would otherwise make churn exceed 100%.
        startedAt: { $lt: periodFrom },
        $or: [
          { endedAt: { $gte: periodFrom, $lte: periodTo } },
          {
            endedAt: null,
            canceledAt: { $gte: periodFrom, $lte: periodTo },
          },
        ],
      }),
    ]);

  const churnRatio =
    activeAtPeriodStart > 0 ? canceledInPeriod / activeAtPeriodStart : 0;

  return {
    from: periodFrom.toISOString(),
    to: periodTo.toISOString(),
    currency: "INR",
    mrrMinor,
    arrMinor: mrrMinor * 12,
    activeSubscriptions,
    pastDueSubscriptions,
    activeAtPeriodStart,
    canceledInPeriod,
    churnRate: percent(churnRatio),
    churnRatePercent: percent(churnRatio),
    churnRateRatio: Number(churnRatio.toFixed(4)),
    payingSubscriptions: activeSubscriptions + pastDueSubscriptions,
  };
}

export default getSubscriptionMetrics;
