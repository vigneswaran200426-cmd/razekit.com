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
