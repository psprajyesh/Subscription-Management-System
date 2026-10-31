/**
 * Domain constants shared by models, validators and services.
 * Keeping enums in one place prevents drift between layers.
 */

export const CURRENCIES = ["INR"];

export const BILLING_CYCLES = ["monthly", "quarterly", "yearly"];

export const BILLING_CYCLE_MONTHS = Object.freeze({
  monthly: 1,
  quarterly: 3,
  yearly: 12,
});

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
];

/** Statuses that reserve a customer/plan pair (duplicate-subscription guard). */
export const BLOCKING_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "paused"];

export const USER_ROLES = ["admin", "staff"];
export const USER_STATUSES = ["active", "invited", "suspended"];

export const CUSTOMER_STATUSES = ["active", "inactive"];

export const PRODUCT_STATUSES = ["draft", "active", "archived"];

export const PLAN_STATUSES = ["active", "archived"];

export const INVOICE_STATUSES = ["draft", "open", "paid", "void", "overdue"];

export const PAYMENT_STATUSES = [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "partially_refunded",
];

export const PAYMENT_PROVIDERS = ["razorpay", "manual"];

export const REFUND_STATUSES = ["pending", "processed", "failed"];

export const DISCOUNT_TYPES = ["percentage", "fixed"];
export const DISCOUNT_DURATIONS = ["once", "repeating", "forever"];
export const DISCOUNT_STATUSES = ["active", "expired", "disabled"];

export const TAX_STATUSES = ["active", "inactive"];

export const STAFF_STATUSES = ["invited", "active", "suspended"];

export const NOTIFICATION_TYPES = [
  "subscription.created",
  "subscription.canceled",
  "subscription.renewed",
  "payment.succeeded",
  "payment.failed",
  "invoice.paid",
  "invoice.overdue",
  "trial.ending",
  "system",
];

export const INVOICE_STATUSES_PAID = ["paid"];
export const INVOICE_STATUSES_UNPAID = ["open", "overdue"];
