import { describe, expect, it } from "vitest";
import {
  calculateCharge,
  calculateCycleChangeProration,
  calculateDiscountMinor,
  calculatePeriodEnd,
  calculateProration,
  calculateProrationFraction,
  isDiscountApplicable,
  normalizeMonthlyRecurringMinor,
} from "../src/services/billing.service.js";
import { addDaysUTC, addMonthsUTC } from "../src/utils/dates.js";

describe("UTC billing date arithmetic", () => {
  it("clamps month-end and leap-year anniversaries", () => {
    expect(addMonthsUTC("2023-01-31T00:00:00.000Z", 1).toISOString()).toBe(
      "2023-02-28T00:00:00.000Z",
    );
    expect(addMonthsUTC("2024-01-31T10:15:00.000Z", 1).toISOString()).toBe(
      "2024-02-29T10:15:00.000Z",
    );
    expect(addMonthsUTC("2026-11-30T00:00:00.000Z", 3).toISOString()).toBe(
      "2027-02-28T00:00:00.000Z",
    );
    expect(addMonthsUTC("2024-02-29T00:00:00.000Z", 12).toISOString()).toBe(
      "2025-02-28T00:00:00.000Z",
    );
    expect(addDaysUTC("2024-02-28T00:00:00.000Z", 1).toISOString()).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("calculates monthly, quarterly and yearly period ends", () => {
    const start = new Date("2026-01-31T00:00:00.000Z");
    expect(calculatePeriodEnd(start, "monthly").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(calculatePeriodEnd(start, "quarterly").toISOString()).toBe(
      "2026-04-30T00:00:00.000Z",
    );
    expect(calculatePeriodEnd(start, "yearly").toISOString()).toBe(
      "2027-01-31T00:00:00.000Z",
    );
  });

  it("preserves the original day-of-month anchor across short months", () => {
    const januaryEnd = calculatePeriodEnd(
      new Date("2026-01-31T00:00:00.000Z"),
      "monthly",
      31,
    );
    const marchEnd = calculatePeriodEnd(januaryEnd, "monthly", 31);

    expect(januaryEnd.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(marchEnd.toISOString()).toBe("2026-03-31T00:00:00.000Z");

    const leapYear = calculatePeriodEnd(
      new Date("2027-02-28T00:00:00.000Z"),
      "yearly",
      29,
    );
    expect(leapYear.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("returns a clamped remaining-period fraction", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-02-01T00:00:00.000Z");

    expect(calculateProrationFraction(start, end, start)).toBe(1);
    expect(
      calculateProrationFraction(start, end, new Date("2026-01-16T12:00:00.000Z")),
    ).toBe(0.5);
    expect(calculateProrationFraction(start, end, end)).toBe(0);
    expect(
      calculateProrationFraction(start, end, new Date("2026-01-20T00:00:00.000Z")),
    ).toBeCloseTo(12 / 31, 10);
  });
});

describe("billing calculations", () => {
  it("supports quantity, percentage discounts and tax in integer paise", () => {
    expect(
      calculateCharge({
        priceMinor: 100_000,
        quantity: 2,
        discountType: "percentage",
        discountValue: 10,
        taxRateBasisPoints: 1800,
      }),
    ).toEqual({
      grossMinor: 200_000,
      discountMinor: 20_000,
      netMinor: 180_000,
      taxMinor: 32_400,
      totalMinor: 212_400,
    });
  });

  it("supports fixed discounts and never returns a negative payable amount", () => {
    expect(
      calculateCharge({
        priceMinor: 100_000,
        quantity: 2,
        discountType: "fixed",
        discountValue: 15_000,
        taxRateBasisPoints: 0,
      }),
    ).toEqual({
      grossMinor: 200_000,
      discountMinor: 15_000,
      netMinor: 185_000,
      taxMinor: 0,
      totalMinor: 185_000,
    });

    expect(
      calculateCharge({
        priceMinor: 1_000,
        discountType: "fixed",
        discountValue: 999_999,
      }).netMinor,
    ).toBe(0);
    expect(calculateDiscountMinor({ subtotalMinor: 100, discountType: "fixed", discountValue: 500 })).toBe(100);
  });

  it("rounds deterministically at the period boundary", () => {
    expect(calculateCharge({ priceMinor: 100_000, fraction: 1 / 3 })).toEqual({
      grossMinor: 33_333,
      discountMinor: 0,
      netMinor: 33_333,
      taxMinor: 0,
      totalMinor: 33_333,
    });

    expect(
      calculateDiscountMinor({
        subtotalMinor: 10_001,
        discountType: "percentage",
        discountValue: 7.5,
      }),
    ).toBe(750);
  });

  it("prorates upgrades using unused credit from the current period", () => {
    const now = new Date("2026-01-16T12:00:00.000Z");
    const proration = calculateProration({
      currentSubscription: {
        priceMinor: 100_000,
        quantity: 1,
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
        taxRateBasisPoints: 0,
      },
      targetPlan: { priceMinor: 200_000 },
      now,
    });

    expect(proration.remainingFraction).toBe(0.5);
    expect(proration.currentCreditMinor).toBe(50_000);
    expect(proration.targetChargeMinor).toBe(100_000);
    expect(proration.amountDueMinor).toBe(50_000);
    expect(proration.creditMinor).toBe(0);
  });

  it("starts a full target cycle when the billing cycle changes", () => {
    const now = new Date("2026-01-16T12:00:00.000Z");
    const proration = calculateCycleChangeProration({
      currentSubscription: {
        priceMinor: 100_000,
        quantity: 1,
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
        taxRateBasisPoints: 0,
      },
      targetPlan: { priceMinor: 1_200_000, billingCycle: "yearly" },
      now,
    });

    expect(proration.currentCreditMinor).toBe(50_000);
    expect(proration.targetChargeMinor).toBe(1_200_000);
    expect(proration.amountDueMinor).toBe(1_150_000);
    expect(proration.periodStart.toISOString()).toBe(now.toISOString());
    expect(proration.periodEnd.toISOString()).toBe("2027-01-16T12:00:00.000Z");
    expect(proration.cycleChanged).toBe(true);
  });

  it("returns excess downgrade credit without a negative amount due", () => {    const proration = calculateProration({
      currentSubscription: {
        priceMinor: 200_000,
        quantity: 1,
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
        taxRateBasisPoints: 0,
      },
      targetPlan: { priceMinor: 100_000 },
      now: new Date("2026-01-16T12:00:00.000Z"),
    });

    expect(proration.amountDueMinor).toBe(0);
    expect(proration.creditMinor).toBe(50_000);
  });

  it("applies fixed and percentage discounts proportionally to proration", () => {
    const base = {
      currentSubscription: {
        priceMinor: 100_000,
        quantity: 1,
        currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
        taxRateBasisPoints: 0,
      },
      targetPlan: { priceMinor: 200_000 },
      now: new Date("2026-01-16T12:00:00.000Z"),
    };

    const percentage = calculateProration({
      ...base,
      discountType: "percentage",
      discountValue: 10,
    });
    expect(percentage.currentCreditMinor).toBe(45_000);
    expect(percentage.targetChargeMinor).toBe(90_000);
    expect(percentage.amountDueMinor).toBe(45_000);

    const fixed = calculateProration({
      ...base,
      discountType: "fixed",
      discountValue: 10_000,
    });
    expect(fixed.currentCreditMinor).toBe(45_000);
    expect(fixed.targetChargeMinor).toBe(95_000);
    expect(fixed.amountDueMinor).toBe(50_000);
  });

  it("expires repeating discounts by calendar months across billing cycles", () => {
    const startedAt = new Date("2026-01-15T00:00:00.000Z");
    const subscription = {
      discountType: "percentage",
      discountValue: 10,
      discountDuration: "repeating",
      discountDurationMonths: 3,
      discountStartedAt: startedAt,
      billingCycle: "yearly",
      discountApplications: 1,
    };

    expect(
      isDiscountApplicable(subscription, new Date("2026-03-15T00:00:00.000Z")),
    ).toBe(true);
    expect(
      isDiscountApplicable(subscription, new Date("2026-04-15T00:00:00.000Z")),
    ).toBe(false);
    expect(
      isDiscountApplicable(subscription, new Date("2027-01-15T00:00:00.000Z")),
    ).toBe(false);
  });

  it("normalises fixed and percentage discounts across billing cycles", () => {
    const monthly = normalizeMonthlyRecurringMinor({
      priceMinor: 100_000,
      billingCycle: "monthly",
      discountType: "fixed",
      discountValue: 10_000,
    });
    const quarterly = normalizeMonthlyRecurringMinor({
      priceMinor: 300_000,
      billingCycle: "quarterly",
      discountType: "fixed",
      discountValue: 30_000,
    });
    const yearly = normalizeMonthlyRecurringMinor({
      priceMinor: 1_200_000,
      billingCycle: "yearly",
      discountType: "fixed",
      discountValue: 120_000,
    });

    expect(monthly).toBe(90_000);
    expect(quarterly).toBe(90_000);
    expect(yearly).toBe(90_000);

    expect(
      normalizeMonthlyRecurringMinor({
        priceMinor: 1_200_000,
        billingCycle: "yearly",
        discountType: "percentage",
        discountValue: 10,
      }),
    ).toBe(90_000);
  });
});
