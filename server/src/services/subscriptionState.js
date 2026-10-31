import { AppError } from "../utils/AppError.js";

/**
 * Explicit lifecycle graph. Renewal and reactivation reuse existing statuses,
 * so they are handled by service-level guards rather than status-only edges.
 */
export const SUBSCRIPTION_TRANSITIONS = Object.freeze({
  trialing: ["active", "past_due", "paused", "canceled", "expired"],
  active: ["past_due", "paused", "canceled", "expired"],
  past_due: ["active", "paused", "canceled", "expired"],
  paused: ["active", "canceled", "expired"],
  canceled: [],
  expired: [],
});

export function canTransition(from, to) {
  return Boolean(SUBSCRIPTION_TRANSITIONS[from]?.includes(to));
}

export function assertTransition(from, to, action = "transition") {
  if (!canTransition(from, to)) {
    throw new AppError(
      `Cannot ${action} a subscription in status "${from}"`,
      {
        statusCode: 409,
        code: "INVALID_TRANSITION",
        details: { from, to, action },
      },
    );
  }
}

export const RENEWABLE_STATUSES = Object.freeze(["active", "past_due"]);
export const BILLABLE_STATUSES = Object.freeze(["active", "past_due"]);
export const ENDED_STATUSES = Object.freeze(["canceled", "expired"]);
