// @ts-nocheck
// Stripe provider — ported verbatim from base44/shared/money/providers/stripe.ts.
import { hmacHex } from './crypto.js';

const API = 'https://api.stripe.com/v1';

function formEncode(obj) {
  const params = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v != null) params.append(k, String(v));
  });
  return params.toString();
}

async function stripeRequest(creds, path, method, params, idempotencyKey) {
  const headers = {
    Authorization: `Bearer ${creds.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : formEncode(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.status;
    throw new Error(`STRIPE_ERROR:${msg}`);
  }
  return data;
}

export async function createCheckoutSession(creds, { amountMinor, currency, reference, contestId, successUrl, cancelUrl }) {
  return stripeRequest(creds, '/checkout/sessions', 'POST', {
    mode: 'payment',
    'line_items[0][price_data][currency]': currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': Math.round(amountMinor),
    'line_items[0][price_data][product_data][name]': 'Razekit contest prize funding',
    'line_items[0][quantity]': 1,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: reference,
    'metadata[reference]': reference,
    'metadata[contest_id]': contestId,
  });
}

export async function fetchSession(creds, sessionId) {
  return stripeRequest(creds, `/checkout/sessions/${sessionId}`, 'GET', null);
}

export async function verifyWebhookSignature(webhookSecret, rawBody, signatureHeader) {
  if (!webhookSecret || !signatureHeader || !rawBody) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => kv.split('=').map((s) => s.trim()))
  );
  if (!parts.t || !parts.v1) return false;
  const actual = await hmacHex(webhookSecret, `${parts.t}.${rawBody}`);
  return actual === parts.v1;
}

export async function createTransfer(creds, { amountMinor, currency, connectedAccountId, idempotencyKey }) {
  return stripeRequest(creds, '/transfers', 'POST', {
    amount: Math.round(amountMinor),
    currency: currency.toLowerCase(),
    destination: connectedAccountId,
  }, idempotencyKey);
}

export async function fetchTransfer(creds, transferId) {
  return stripeRequest(creds, `/transfers/${transferId}`, 'GET', null);
}
