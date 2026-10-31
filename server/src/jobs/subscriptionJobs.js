import { Subscription } from "../models/index.js";
import { recordAudit } from "../services/audit.service.js";
import { renewSubscription } from "../services/subscription.service.js";

const EXPIRABLE_STATUSES = ["trialing", "active", "past_due", "paused"];

/**
 * Cancels subscriptions whose scheduled cancellation date has arrived.
 * The update is conditional on the exact period end that was observed, so a
 * concurrent run cannot cancel/advance the same record twice.
 */
export async function processScheduledCancellations({
  now = new Date(),
  limit = 100,
} = {}) {
  const due = await Subscription.find({
    cancelAtPeriodEnd: true,
    status: { $in: EXPIRABLE_STATUSES },
    currentPeriodEnd: { $lte: now },
  })
    .sort({ currentPeriodEnd: 1 })
    .limit(limit)
    .select("_id currentPeriodEnd status");

  let expired = 0;
  let skipped = 0;
  const errors = [];

  for (const subscription of due) {
    try {
      const endedAt = subscription.currentPeriodEnd;
      const updated = await Subscription.findOneAndUpdate(
        {
          _id: subscription._id,
          cancelAtPeriodEnd: true,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        {
          $set: {
            status: "canceled",
            cancelAtPeriodEnd: false,
            endedAt,
            canceledAt: endedAt,
          },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        skipped += 1;
        continue;
      }

      expired += 1;

      await recordAudit({
        actor: null,
        action: "subscription.canceled",
        entityType: "Subscription",
        entityId: updated._id,
        diff: { automatic: true, atPeriodEnd: true, endedAt },
      });
    } catch (error) {
      errors.push({
        subscription: String(subscription._id),
        code: error.code || "ERROR",
        message: error.message,
      });
    }
  }

  return { processed: due.length, expired, skipped, failed: errors.length, errors };
}

/**
 * Expires trials that reached their end without being activated. This keeps
 * un-converted trials from lingering as non-billable subscriptions forever.
 */
export async function processTrialExpirations({ now = new Date(), limit = 100 } = {}) {
  const due = await Subscription.find({
    status: "trialing",
    cancelAtPeriodEnd: false,
    trialEndsAt: { $lte: now },
  })
    .sort({ trialEndsAt: 1 })
    .limit(limit)
    .select("_id trialEndsAt");

  let expired = 0;
  let skipped = 0;
  const errors = [];

  for (const subscription of due) {
    try {
      const endedAt = subscription.trialEndsAt;
      const updated = await Subscription.findOneAndUpdate(
        {
          _id: subscription._id,
          status: "trialing",
          cancelAtPeriodEnd: false,
          trialEndsAt: subscription.trialEndsAt,
        },
        {
          $set: {
            status: "expired",
            endedAt,
            cancellationReason: "Trial ended without activation",
          },
        },
        { returnDocument: "after" },
      );

      if (!updated) {
        skipped += 1;
        continue;
      }

      expired += 1;

      await recordAudit({
        actor: null,
        action: "subscription.expired",
        entityType: "Subscription",
        entityId: updated._id,
        diff: { automatic: true, trialEnded: true, endedAt },
      });
    } catch (error) {
      errors.push({
        subscription: String(subscription._id),
        code: error.code || "ERROR",
        message: error.message,
      });
    }
  }

  return { processed: due.length, expired, skipped, failed: errors.length, errors };
}

export async function processExpirations({ now = new Date(), limit = 100 } = {}) {
  const scheduled = await processScheduledCancellations({ now, limit });
  const trials = await processTrialExpirations({ now, limit });

  return {
    processed: scheduled.processed + trials.processed,
    expired: scheduled.expired + trials.expired,
    scheduledCancellations: scheduled.expired,
    trialExpirations: trials.expired,
    skipped: scheduled.skipped + trials.skipped,
    failed: scheduled.failed + trials.failed,
    errors: [...scheduled.errors, ...trials.errors],
  };
}

/**
 * Renews every due active/past-due subscription exactly once.
 * Invoice uniqueness plus the optimistic subscription update make repeated or
 * concurrent runs retry-safe.
 */
export async function processRenewals({ now = new Date(), limit = 100 } = {}) {
  const due = await Subscription.find({
    status: { $in: ["active", "past_due"] },
    nextBillingAt: { $lte: now },
    cancelAtPeriodEnd: { $ne: true },
  })
    .sort({ nextBillingAt: 1 })
    .limit(limit)
    .select("_id");

  let renewed = 0;
  let skipped = 0;
  const errors = [];

  for (const subscription of due) {
    try {
      const result = await renewSubscription(subscription._id, {
        actor: null,
        now,
        requireDue: true,
      });

      if (result.renewed) {
        renewed += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      errors.push({
        subscription: String(subscription._id),
        code: error.code || "ERROR",
        message: error.message,
      });
    }
  }

  return { processed: due.length, renewed, skipped, failed: errors.length, errors };
}

export async function processSubscriptionJobs({
  now = new Date(),
  limit = 100,
} = {}) {
  const expirations = await processExpirations({ now, limit });
  const renewals = await processRenewals({ now, limit });

  return { now: new Date(now).toISOString(), expirations, renewals };
}

export default processSubscriptionJobs;
