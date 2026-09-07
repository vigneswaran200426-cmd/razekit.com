// Money core — the only place money arithmetic is defined.
// Authoritative amounts are ALWAYS integers in the currency's minor unit
// (paise / cents). Floating-point money is never a source of truth.

export const MINOR_SCALE = { INR: 100, USD: 100 };

export function minorScale(currency) {
  const scale = MINOR_SCALE[currency];
  if (!scale) throw new Error(`UNSUPPORTED_CURRENCY:${currency}`);
  return scale;
}

// Convert a display/major amount (e.g. rupees entered by a brand) to minor units.
export function toMinor(major, currency) {
  const n = Number(major);
  if (!Number.isFinite(n) || n < 0) throw new Error(`INVALID_AMOUNT:${major}`);
  return Math.round(n * minorScale(currency));
}

export function toMajor(minor, currency) {
  return Math.round(Number(minor)) / minorScale(currency);
}

// Centralized rounding policy for ALL financial calculations: half-up on the
// absolute value. No component or function may round money on its own.
export function roundDiv(numerator, denominator) {
  if (!denominator) throw new Error('DIVIDE_BY_ZERO');
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(numerator) / denominator + 0.5);
}

// Integer-safe percentage-of calculation: basis points (1000 bps = 10%).
export function feeFromBps(baseMinor, bps) {
  return roundDiv(Math.round(baseMinor) * (Number(bps) || 0), 10000);
}

// Money object guard — a monetary value without currency context is a bug.
export function assertMoneyShape(amountMinor, currency) {
  if (!Number.isInteger(Math.round(amountMinor)) || amountMinor < 0) {
    throw new Error(`INVALID_MINOR_AMOUNT:${amountMinor}`);
  }
  minorScale(currency);
}

// Human-readable internal finance reference (RK-PAY-…, RK-TXN-…, …).
export function makeRef(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}