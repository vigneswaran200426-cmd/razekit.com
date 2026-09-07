// Central money formatting — the ONLY place currency symbols are rendered.
// Consumes standardized { amountMinor, currency } money objects; amounts are
// always integers in minor units. Never manually concatenate "₹" + amount.

export const CURRENCIES = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
};

export function supportedCurrency(currency) {
  return Boolean(CURRENCIES[currency]);
}

// formatMoneyMinor(500000, 'INR') → "₹5,000" · formatMoneyMinor(50000, 'USD') → "$500"
export function formatMoneyMinor(amountMinor, currency = 'INR') {
  const cfg = CURRENCIES[currency] || { locale: 'en-US' };
  const value = (Number(amountMinor) || 0) / 100;
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

// Major-unit convenience for legacy/display values (e.g. contest.prize_amount).
export function formatMoney(amount, currency = 'INR') {
  return formatMoneyMinor(Math.round((Number(amount) || 0) * 100), currency);
}