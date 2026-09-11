// @ts-nocheck
// RazeKit contest fairness: prize value determines the allowed contest duration.
// THE single source of truth — enforced server-side (entities/service.ts) and
// mirrored read-only by the contest creation UI.
//
// Tiers are expressed in INR (the platform's settlement currency for the IN market).

export const DURATION_RULE_VERSION = 'rk-duration-1.0.0';
export const GLOBAL_MAX_DAYS = 30;

// ── Promotional exception ───────────────────────────────────────────────────
// The platform owner approved three 28-day launch contests at a ₹50,000 prize.
// Under the normal tiers ₹50,000 is Tier B (max 7 days), so the only honest way
// to run them is a NAMED, NARROW exception that an admin can point at — not a
// widened tier, which would silently re-price fairness for every brand.
//
// The exception is deliberately as small as the approval: INR only, that exact
// prize, 28 days, and still under the global 30-day cap. Anything outside that
// needs a new rule version and a new approval, which is the point.
//
// Selecting it is NOT a client decision: Contest.duration_rule_version is in
// the server-only protected field list, so a browser cannot ask for this rule
// by sending the string. The seeding script (scripts/seed-razekit-campaigns.ts)
// is the path that applies it.
export const PROMOTIONAL_RULE_VERSION = 'rk-duration-promo-1.0.0';

export const PROMOTIONAL_RULE = {
  ruleVersion: PROMOTIONAL_RULE_VERSION,
  label: 'Approved promotional launch contests (28 days)',
  description:
    'Owner-approved exception for the RazeKit launch contests: a ₹50,000 prize may run 28 days '
    + 'instead of the Tier B maximum of 7 days. Applies only to contests seeded under this rule version.',
  minDays: 1,
  maxDays: 28,
  // Inclusive INR prize band. Exactly the approved prize — a band wider than
  // the approval would be a quiet rule change wearing an exception's name.
  minPrize: 50000,
  maxPrize: 50000,
  currency: 'INR',
  approvedByName: 'RazeKit platform owner',
};

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

/** Allowed [minDays, maxDays] under the promotional exception. */
export function allowedPromotionalDuration() {
  return {
    tier: null,
    promotional: true,
    label: PROMOTIONAL_RULE.label,
    minDays: PROMOTIONAL_RULE.minDays,
    maxDays: Math.min(PROMOTIONAL_RULE.maxDays, GLOBAL_MAX_DAYS),
    ruleVersion: PROMOTIONAL_RULE_VERSION,
  };
}

// The promotional branch, kept in its own function so the normal path below
// reads exactly as it did before the exception existed.
function validatePromotional({ prizeAmount, days }) {
  const p = Number(prizeAmount);
  if (!Number.isFinite(p) || p <= 0) {
    return { ok: false, code: 'INVALID_PRIZE', message: 'Enter a valid prize amount.' };
  }
  if (p < PROMOTIONAL_RULE.minPrize || p > PROMOTIONAL_RULE.maxPrize) {
    return {
      ok: false,
      code: 'PROMO_PRIZE_OUT_OF_RANGE',
      message: `The promotional duration exception was approved for a ₹${PROMOTIONAL_RULE.maxPrize.toLocaleString('en-IN')} prize only.`,
    };
  }
  const allowed = allowedPromotionalDuration();
  if (days < allowed.minDays || days > allowed.maxDays) {
    return {
      ok: false,
      code: 'DURATION_OUT_OF_RANGE',
      message: `The promotional rule allows a ${allowed.minDays}–${allowed.maxDays} day contest. You selected ${days} ${days === 1 ? 'day' : 'days'}.`,
      ...allowed,
    };
  }
  return { ok: true, ...allowed };
}

/**
 * Validate a prize/duration combination.
 * Returns { ok: true, ... } or { ok: false, code, message, ... }.
 *
 * `ruleVersion` selects which rule applies and defaults to the normal tiers, so
 * every existing caller behaves exactly as before. Passing
 * PROMOTIONAL_RULE_VERSION swaps the TIER bound for the promotional bound — the
 * global 30-day cap below is checked first and is never swapped out.
 *
 * Currency note: the tiers are defined in INR. For a non-INR contest we cannot
 * convert without inventing an FX rate, so only the global 30-day cap is
 * enforced. Flagged as REQUIRES PRODUCT DECISION (see RAZEKIT_EXECUTION_STATUS.md).
 * The promotional exception is NOT extended that way: it was approved for one
 * INR prize, and an FX guess is not an approval.
 */
export function validatePrizeDuration({ prizeAmount, days, currency = 'INR', ruleVersion = DURATION_RULE_VERSION }) {
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

  if (ruleVersion === PROMOTIONAL_RULE_VERSION) {
    if (String(currency).toUpperCase() !== PROMOTIONAL_RULE.currency) {
      return {
        ok: false,
        code: 'PROMO_CURRENCY_NOT_SUPPORTED',
        message: `The promotional duration exception applies to ${PROMOTIONAL_RULE.currency} prizes only.`,
      };
    }
    return validatePromotional({ prizeAmount, days: d });
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

/**
 * Explain, in words an admin can read, WHY a contest was allowed its duration.
 *
 * An exception nobody can point at is indistinguishable from a bug, so this
 * never returns null: an unrecognised or missing rule version is reported as
 * exactly that rather than rendering as a blank cell that looks approved.
 */
export function describeRule(ruleVersion) {
  const v = ruleVersion ? String(ruleVersion) : null;

  if (v === PROMOTIONAL_RULE_VERSION) {
    const allowed = allowedPromotionalDuration();
    return {
      known: true,
      promotional: true,
      ruleVersion: PROMOTIONAL_RULE_VERSION,
      label: PROMOTIONAL_RULE.label,
      minDays: allowed.minDays,
      maxDays: allowed.maxDays,
      approvedByName: PROMOTIONAL_RULE.approvedByName,
      explanation:
        `This contest runs under an approved promotional exception, not the standard prize tiers. `
        + `${PROMOTIONAL_RULE.approvedByName} approved a ₹${PROMOTIONAL_RULE.maxPrize.toLocaleString('en-IN')} prize `
        + `running up to ${allowed.maxDays} days, instead of the ${PRIZE_TIERS[1].maxDays} days its tier would normally allow. `
        + `The global ${GLOBAL_MAX_DAYS}-day maximum still applies.`,
    };
  }

  if (v === DURATION_RULE_VERSION) {
    return {
      known: true,
      promotional: false,
      ruleVersion: DURATION_RULE_VERSION,
      label: 'Standard prize-to-duration fairness tiers',
      minDays: null,
      maxDays: GLOBAL_MAX_DAYS,
      approvedByName: null,
      explanation:
        `This contest runs under the standard fairness tiers: the prize decides the allowed window `
        + `(${PRIZE_TIERS.map((t) => `${t.label} → ${t.minDays}–${t.maxDays} days`).join('; ')}), `
        + `capped at ${GLOBAL_MAX_DAYS} days overall.`,
    };
  }

  if (!v) {
    return {
      known: false,
      promotional: false,
      ruleVersion: null,
      label: 'Not recorded',
      minDays: null,
      maxDays: null,
      approvedByName: null,
      explanation:
        'No duration rule was recorded for this contest. It predates server-side fairness enforcement, '
        + 'so its duration was never validated — treat it as unverified, not as approved.',
    };
  }

  return {
    known: false,
    promotional: false,
    ruleVersion: v,
    label: 'Unrecognised rule version',
    minDays: null,
    maxDays: null,
    approvedByName: null,
    explanation:
      `This contest records duration rule "${v}", which this build does not recognise. `
      + 'It was written by a different version of the platform; do not read it as an approval.',
  };
}
