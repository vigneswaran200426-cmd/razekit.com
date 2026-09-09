// @ts-nocheck
// Server-side enforcement of the prize -> duration fairness rule (spec §14).
// Frontend validation is not sufficient: this runs inside the entity service so
// no direct API call, script or internal mutation can bypass it.
import { validatePrizeDuration, durationInDays, allowedDuration, DURATION_RULE_VERSION } from './duration.js';
import { validateDestinationUrl } from '../traffic/url.js';

// Any of these changing re-runs server-side validation. brand_destination_url
// is included because it is a security boundary, not just a fairness input.
const FAIRNESS_INPUTS = ['prize_amount', 'deadline', 'start_date', 'brand_destination_url'];

/** True when a patch actually touches the fairness inputs. */
export function touchesFairness(patch) {
  return FAIRNESS_INPUTS.some((k) => Object.prototype.hasOwnProperty.call(patch || {}, k));
}

/**
 * Validate a merged Contest payload and stamp the resolved rule metadata.
 * Mutates `data` (adds min/max duration + rule version). Throws via `raise`.
 *
 * Existing contests are NOT retro-validated: callers only invoke this when the
 * fairness inputs change, so historical data stays safe.
 */
export function enforceContestFairness(data, raise) {
  // Campaign destination is a security boundary (open redirect / SSRF), so it
  // is validated here — the click path only replays a value that passed.
  if (data.brand_destination_url) {
    const d = validateDestinationUrl(data.brand_destination_url);
    if (!d.ok) raise(d.message, 400);
    data.brand_destination_url = d.url;
  }

  const prize = Number(data.prize_amount);
  if (!Number.isFinite(prize) || prize <= 0) raise('Enter a valid prize amount.', 400);

  if (!data.deadline) raise('A contest deadline is required.', 400);

  // Duration is measured from the contest start (or creation) to the deadline.
  const start = data.start_date || data.created_date || new Date().toISOString();
  const days = durationInDays(start, data.deadline);

  if (days === null) raise('The contest deadline is not a valid date.', 400);
  if (days <= 0) raise('The contest deadline must be in the future.', 400);

  const result = validatePrizeDuration({
    prizeAmount: prize,
    days,
    currency: data.currency || 'INR',
  });

  if (!result.ok) raise(result.message, 400);

  // Stamp the authoritative rule metadata (clients cannot write these).
  const allowed = allowedDuration(prize);
  if (allowed && String(data.currency || 'INR').toUpperCase() === 'INR') {
    data.min_duration_days = allowed.minDays;
    data.max_duration_days = allowed.maxDays;
  }
  data.duration_rule_version = DURATION_RULE_VERSION;
  return result;
}
