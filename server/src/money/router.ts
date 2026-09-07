// @ts-nocheck
// PaymentProviderRouter — ported verbatim from base44/shared/money/router.ts.
import { validateCurrencyForMarket } from './markets.js';

export function readCreds(secrets) {
  const get = (name) => {
    try {
      return secrets.get(name) || null;
    } catch (e) {
      return null;
    }
  };
  return {
    razorpayKeyId: get('RAZORPAY_KEY_ID'),
    razorpayKeySecret: get('RAZORPAY_KEY_SECRET'),
    razorpayWebhookSecret: get('RAZORPAY_WEBHOOK_SECRET'),
    stripeSecretKey: get('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: get('STRIPE_WEBHOOK_SECRET'),
  };
}

export function routePayment(market, currency, creds) {
  const currencyOk = validateCurrencyForMarket(market.key, currency);
  if (!currencyOk.ok) return currencyOk;
  if (market.paymentProvider === 'razorpay') {
    if (!creds.razorpayKeyId || !creds.razorpayKeySecret) {
      return { ok: false, code: 'PROVIDER_UNAVAILABLE', provider: 'razorpay', message: 'Razorpay is not configured for the India (INR) market yet — payments cannot be initiated.' };
    }
    return { ok: true, provider: 'razorpay' };
  }
  if (market.paymentProvider === 'stripe') {
    if (!creds.stripeSecretKey) {
      return { ok: false, code: 'PROVIDER_UNAVAILABLE', provider: 'stripe', message: 'Stripe is not configured for the international (USD) market yet — payments cannot be initiated.' };
    }
    return { ok: true, provider: 'stripe' };
  }
  return { ok: false, code: 'PROVIDER_UNAVAILABLE', message: 'No payment provider is configured for this market.' };
}

export function routePayout(market, currency, creds) {
  const currencyOk = validateCurrencyForMarket(market.key, currency);
  if (!currencyOk.ok) return currencyOk;
  if (market.payoutProvider === 'razorpay_route') {
    if (!creds.razorpayKeyId || !creds.razorpayKeySecret) {
      return { ok: false, code: 'PROVIDER_UNAVAILABLE', provider: 'razorpay', message: 'Razorpay Route is not configured for India (INR) payouts yet.' };
    }
    return { ok: true, provider: 'razorpay' };
  }
  if (market.payoutProvider === 'stripe_connect') {
    if (!creds.stripeSecretKey) {
      return { ok: false, code: 'PROVIDER_UNAVAILABLE', provider: 'stripe', message: 'Stripe Connect is not configured for international (USD) payouts yet.' };
    }
    return { ok: true, provider: 'stripe' };
  }
  return { ok: false, code: 'PROVIDER_UNAVAILABLE', message: 'No payout provider is configured for this market.' };
}
