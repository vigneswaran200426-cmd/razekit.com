const SYMBOL = { INR: '₹', USD: '$' };

export function money(amount, currency = 'INR') {
  const sym = SYMBOL[currency] || '₹';
  const locale = currency === 'USD' ? 'en-US' : 'en-IN';
  return sym + Number(amount || 0).toLocaleString(locale);
}

// Amounts stored in minor units (paise/cents).
export function moneyMinor(minor, currency = 'INR') {
  return money(Number(minor || 0) / 100, currency);
}

export function initials(nameOrEmail) {
  return String(nameOrEmail || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function timeLeft(deadline) {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function dateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A human label for a funding state.
 *
 * The states themselves are owned by the server (server/src/payments/states.ts,
 * FUNDING_COPY) and these labels mirror the ones it uses in its own emails, so
 * a brand reading "Awaiting your transfer" on the dashboard sees the same words
 * RazeKit sent them.
 *
 * The fallback is the important part. The previous code ran the raw enum
 * through a helper that only uppercased the FIRST character, so an unrecognised
 * value reached a brand's money row as "PAYMENT INSTRUCTIONS SHOWN" — internal
 * SCREAMING_SNAKE vocabulary shown to a customer. Anything unmapped is now
 * title-cased instead, so a state added server-side before this map catches up
 * degrades to "Payment instructions shown" rather than shouting.
 */
const FUNDING_LABEL = {
  FUNDING_REQUIRED: 'Funding required',
  PAYMENT_INSTRUCTIONS_SHOWN: 'Awaiting your transfer',
  TRANSFER_REPORTED: 'Transfer reported',
  PENDING_VERIFICATION: 'Being verified',
  NEEDS_INFORMATION: 'More information needed',
  PARTIAL: 'Part payment received',
  OVERPAID: 'Overpayment received',
  VERIFIED: 'Funded',
  REJECTED: 'Could not be verified',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund in progress',
  REFUNDED: 'Refunded',
};

export function fundingStatusLabel(status) {
  if (!status) return '';
  const key = String(status).trim().toUpperCase();
  if (FUNDING_LABEL[key]) return FUNDING_LABEL[key];
  const words = key.toLowerCase().replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}
