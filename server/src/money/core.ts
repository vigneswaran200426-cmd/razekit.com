// @ts-nocheck
// Money core — ported verbatim from base44/shared/money/core.ts.
export const MINOR_SCALE = { INR: 100, USD: 100 };

export function minorScale(currency) {
  const scale = MINOR_SCALE[currency];
  if (!scale) throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
  return scale;
}

export function toMinor(major, currency) {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) throw new Error(`INVALID_AMOUNT:${major}`);
  return Math.round(n * minorScale(currency));
}

export function toMajor(minor, currency) {
  return Math.round(Number(minor)) / minorScale(currency);
}

export function roundDiv(numerator, denominator) {
  if (!denominator) throw new Error('DIVIDE_BY_ZERO');
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(numerator) / denominator + 0.5);
}

export function feeFromBps(baseMinor, bps) {
  return roundDiv(Math.round(baseMinor) * (Number(bps) || 0), 10000);
}

export function assertMoneyShape(amountMinor, currency) {
  if (!Number.isInteger(Math.round(amountMinor)) || amountMinor < 0) {
    throw new Error(`INVALID_MINOR_AMOUNT:${amountMinor}`);
  }
  minorScale(currency);
}

export function makeRef(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}
