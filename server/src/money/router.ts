// @ts-nocheck
// PaymentProviderRouter — ported from base44/shared/money/router.ts, extended
// with PayPal (Orders v2). PayPal is PREFERRED whenever its credentials are
// configured and the settlement currency is one PayPal supports (INR is not,
// so INR contests stay on Razorpay).
import { validateCurrencyForMarket } from './markets.js';
import { PAYPAL_CURRENCIES } from './providers/paypal.js';

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
    paypalClientId: get('PAYPAL_CLIENT_ID'),
    paypalClientSecret: get('PAYPAL_CLIENT_SECRET'),
    paypalEnv: get('PAYPAL_ENV') || 'sandbox',
    paypalWebhookId: get('PAYPAL_WEBHOOK_ID'),
  };
}

function paypalReady(creds, currency) {
  return Boolean(creds.paypalClientId && creds.paypalClientSecret && PAYPAL_CURRENCIES.has(currency));
}

export function routePayment(market, currency, creds) {
  const currencyOk = validateCurrencyForMarket(market.key, currency);
  if (!currencyOk.ok) return currencyOk;
  // Prefer PayPal when it is configured and supports this currency.
  if (paypalReady(creds, currency)) return { ok: true, provider: 'paypal' };
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
  // Prefer PayPal Payouts when configured and the currency is supported.
  if (paypalReady(creds, currency)) return { ok: true, provider: 'paypal' };
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
