const UNIT_MS = Object.freeze({
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
});

/**
 * Converts values such as "15m", "7d" or 900000 into milliseconds.
 * Used for cookie max-age; JWT accepts the string form directly.
 */
export function parseDurationToMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = /^(\d+)\s*(ms|s|m|h|d)$/i.exec(String(value).trim());
  if (!match) {
    throw new Error(`Invalid duration value: ${value}`);
  }

  return Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
}

export default parseDurationToMs;
