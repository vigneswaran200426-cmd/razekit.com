// @ts-nocheck
// RazeKit contest fairness: prize value determines the allowed contest duration.
// THE single source of truth — enforced server-side (entities/service.ts) and
// mirrored read-only by the contest creation UI.
//
// Tiers are expressed in INR (the platform's settlement currency for the IN market).

export const DURATION_RULE_VERSION = 'rk-duration-1.0.0';
export const GLOBAL_MAX_DAYS = 30;

// Boundaries are INCLUSIVE upper bounds, so 20000 -> A and 20001 -> B.
export const PRIZE_TIERS = [
  { tier: 'A', maxPrize: 20000,   minDays: 1, maxDays: 3,  label: '₹5,000–₹20,000' },
  { tier: 'B', maxPrize: 50000,   minDays: 1, maxDays: 7,  label: '₹20,001–₹50,000' },
  { tier: 'C', maxPrize: 100000,  minDays: 7, maxDays: 15, label: '₹50,001–₹1,00,000' },
  { tier: 'D', maxPrize: Infinity, minDays: 7, maxDays: 30, label: 'Above ₹1,00,000' },
];

/** Resolve the fairness tier for a prize amount (INR). */
export function tierForPrize(prizeAmount) {
  const p = Number(prizeAmount);
  if (!Number.isFinite(p) || p < 0) return null;
  return PRIZE_TIERS.find((t) => p <= t.maxPrize) || PRIZE_TIERS[PRIZE_TIERS.length - 1];
}

/** Allowed [minDays, maxDays] for a prize. Never exceeds the global 30-day cap. */
export function allowedDuration(prizeAmount) {
  const t = tierForPrize(prizeAmount);
  if (!t) return null;
  return {
    tier: t.tier,
    label: t.label,
    minDays: t.minDays,
    maxDays: Math.min(t.maxDays, GLOBAL_MAX_DAYS),
    ruleVersion: DURATION_RULE_VERSION,
  };
}

/** Whole days between two dates, rounded up (a partial day counts as a day). */
export function durationInDays(startISO, endISO) {
  const start = Date.parse(startISO);
  const end = Date.parse(endISO);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const ms = end - start;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
}

/**
 * Validate a prize/duration combination.
 * Returns { ok: true, ... } or { ok: false, code, message, ... }.
 *
 * Currency note: the tiers are defined in INR. For a non-INR contest we cannot
 * convert without inventing an FX rate, so only the global 30-day cap is
 * enforced. Flagged as REQUIRES PRODUCT DECISION (see RAZEKIT_EXECUTION_STATUS.md).
 */
export function validatePrizeDuration({ prizeAmount, days, currency = 'INR' }) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) {
    return { ok: false, code: 'INVALID_DURATION', message: 'Contest duration must be at least 1 day.' };
  }
  if (d > GLOBAL_MAX_DAYS) {
    return {
      ok: false, code: 'DURATION_ABOVE_GLOBAL_MAX',
      message: `No contest may run longer than ${GLOBAL_MAX_DAYS} days.`,
    };
  }
  if (String(currency).toUpperCase() !== 'INR') {
    return { ok: true, tier: null, minDays: 1, maxDays: GLOBAL_MAX_DAYS, ruleVersion: DURATION_RULE_VERSION, currencyExempt: true };
  }

  const allowed = allowedDuration(prizeAmount);
  if (!allowed) {
    return { ok: false, code: 'INVALID_PRIZE', message: 'Enter a valid prize amount.' };
  }
  if (d < allowed.minDays || d > allowed.maxDays) {
    return {
      ok: false,
      code: 'DURATION_OUT_OF_RANGE',
      message: `A ₹${Number(prizeAmount).toLocaleString('en-IN')} prize allows a ${allowed.minDays}–${allowed.maxDays} day contest. You selected ${d} ${d === 1 ? 'day' : 'days'}.`,
      ...allowed,
    };
  }
  return { ok: true, ...allowed };
}
