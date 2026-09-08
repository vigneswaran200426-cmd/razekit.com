// @ts-nocheck
// PayPal provider — Orders v2 (create → payer approval → capture), Payouts, and
// webhook signature verification. Uses only the built-in global fetch. The app
// client SECRET is read from server env (via readCreds) and NEVER leaves the
// backend — the frontend only ever receives the PayPal-hosted approval URL.
//
// Sandbox base: https://api-m.sandbox.paypal.com   (PAYPAL_ENV=sandbox)
// Live base:    https://api-m.paypal.com           (PAYPAL_ENV=live)
import { minorScale } from '../core.js';

const BASE = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

// Transaction currencies PayPal supports for Checkout order capture. INR is
// intentionally NOT here — PayPal does not support INR as a checkout currency,
// so the router will never route INR contests to PayPal (they stay on Razorpay).
export const PAYPAL_CURRENCIES = new Set([
  'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY',
  'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB', 'SGD', 'SEK',
  'CHF', 'THB', 'USD',
]);

// Currencies PayPal requires as whole numbers (no decimal component).
const ZERO_DECIMAL = new Set(['HUF', 'JPY', 'TWD']);

function apiBase(env) {
  return BASE[env === 'live' ? 'live' : 'sandbox'];
}

// Convert an internal minor-unit amount into the decimal string PayPal expects.
export function amountValue(amountMinor, currency) {
  const n = Math.round(Number(amountMinor));
  if (ZERO_DECIMAL.has(currency)) return String(n);
  let scale;
  try {
    scale = minorScale(currency);
  } catch {
    scale = 100;
  }
  const decimals = String(scale).length - 1; // 100 -> 2 decimals
  return (n / scale).toFixed(decimals);
}

// ── OAuth: cache the app access token until shortly before it expires ─────────
const tokenCache = new Map(); // `${env}:${clientId}` -> { token, exp }

async function accessToken(creds) {
  const key = `${creds.env}:${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch(`${apiBase(creds.env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PAYPAL_AUTH_ERROR:${data.error_description || data.error || res.status}`);
  tokenCache.set(key, { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3000) * 1000 });
  return data.access_token;
}

async function ppRequest(creds, path, method, body, extraHeaders) {
  const token = await accessToken(creds);
  const res = await fetch(`${apiBase(creds.env)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      (data.details && data.details[0] && (data.details[0].description || data.details[0].issue)) ||
      data.name ||
      res.status;
    throw new Error(`PAYPAL_ERROR:${msg}`);
  }
  return data;
}

// ── Orders v2 ─────────────────────────────────────────────────────────────────
// Create a CAPTURE-intent order and return the PayPal-hosted approval URL.
export async function createOrder(creds, { amountMinor, currency, reference, returnUrl, cancelUrl }) {
  const order = await ppRequest(
    creds,
    '/v2/checkout/orders',
    'POST',
    {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: reference,
          custom_id: reference,
          description: 'RazeKit contest prize funding',
          amount: { currency_code: currency, value: amountValue(amountMinor, currency) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'RazeKit',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            landing_page: 'LOGIN',
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
    { 'PayPal-Request-Id': reference }
  );
  const link = (order.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  return { id: order.id, status: order.status, approveUrl: link && link.href };
}

export async function captureOrder(creds, orderId) {
  return ppRequest(creds, `/v2/checkout/orders/${orderId}/capture`, 'POST', {}, { Prefer: 'return=representation' });
}

export async function fetchOrder(creds, orderId) {
  return ppRequest(creds, `/v2/checkout/orders/${orderId}`, 'GET', null);
}

// Pull the capture id out of a captured/fetched order (for provider_payment_id).
export function captureIdFromOrder(order) {
  const cap =
    order &&
    order.purchase_units &&
    order.purchase_units[0] &&
    order.purchase_units[0].payments &&
    order.purchase_units[0].payments.captures &&
    order.purchase_units[0].payments.captures[0];
  return (cap && cap.id) || null;
}

// ── Payouts (winner payout via PayPal Payouts API) ─────────────────────────────
export async function createPayout(creds, { amountMinor, currency, receiverEmail, reference }) {
  const batch = await ppRequest(creds, '/v1/payments/payouts', 'POST', {
    sender_batch_header: {
      sender_batch_id: reference,
      email_subject: 'You have a RazeKit payout',
      email_message: 'Your contest winnings from RazeKit.',
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: { value: amountValue(amountMinor, currency), currency },
        receiver: receiverEmail,
        note: `RazeKit winner payout ${reference}`,
        sender_item_id: reference,
      },
    ],
  });
  return {
    id: (batch.batch_header && batch.batch_header.payout_batch_id) || null,
    status: (batch.batch_header && batch.batch_header.batch_status) || 'PENDING',
  };
}

// ── Webhook signature verification ─────────────────────────────────────────────
// Requires PAYPAL_WEBHOOK_ID from the dashboard (Apps & Credentials → Webhooks).
// Until it is set, verification returns false and events are rejected — capture
// still happens synchronously on the payer's return, so funding is unaffected.
export async function verifyWebhookSignature(creds, { headers, rawBody, webhookId }) {
  if (!webhookId || !headers) return false;
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const data = await ppRequest(creds, '/v1/notifications/verify-webhook-signature', 'POST', {
    auth_algo: h('paypal-auth-algo'),
    cert_url: h('paypal-cert-url'),
    transmission_id: h('paypal-transmission-id'),
    transmission_sig: h('paypal-transmission-sig'),
    transmission_time: h('paypal-transmission-time'),
    webhook_id: webhookId,
    webhook_event: event,
  }).catch(() => ({ verification_status: 'FAILURE' }));
  return data.verification_status === 'SUCCESS';
}
