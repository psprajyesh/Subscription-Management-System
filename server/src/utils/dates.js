/**
 * UTC-safe date helpers used by subscription billing.
 *
 * All billing anchors are stored as absolute instants. Calendar arithmetic is
 * performed with UTC components so a server or user timezone can never move an
 * anniversary to a different day. Month additions clamp to the target month's
 * last day (Jan 31 + 1 month -> Feb 28/29), which is the behaviour required for
 * month-end and leap-year subscriptions.
 */

export function addMonthsUTC(date, months) {
  const source = new Date(date);
  if (Number.isNaN(source.getTime())) {
    throw new TypeError("Invalid date supplied to addMonthsUTC");
  }

  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();

  const targetMonthIndex = month + Number(months);
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDayOfTargetMonth),
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    ),
  );
}

export function addDaysUTC(date, days) {
  const source = new Date(date);
  if (Number.isNaN(source.getTime())) {
    throw new TypeError("Invalid date supplied to addDaysUTC");
  }
  return new Date(source.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}

export function addMilliseconds(date, milliseconds) {
  return new Date(new Date(date).getTime() + Number(milliseconds));
}

export function startOfUTCMonth(date = new Date()) {
  const source = new Date(date);
  return new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

export function startOfUTCDay(date = new Date()) {
  const source = new Date(date);
  return new Date(
    Date.UTC(
      source.getUTCFullYear(),
      source.getUTCMonth(),
      source.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

/**
 * Remaining fraction of a billing period, clamped to [0, 1].
 * Using elapsed milliseconds keeps the result deterministic in UTC and works
 * for periods of any length (28/29/30/31-day months and quarterly/yearly
 * cycles).
 */
export function remainingPeriodFraction(periodStart, periodEnd, at = new Date()) {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  const now = new Date(at).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  if (now <= start) return 1;
  if (now >= end) return 0;

  return (end - now) / (end - start);
}

export function minDate(...dates) {
  const valid = dates.filter(Boolean).map((value) => new Date(value));
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map((value) => value.getTime())));
}
