// Razorpay provider — Payment Gateway for INR funding, Route for creator
// transfers. All calls happen server-side; the Key Secret and webhook secret
// never reach the browser.

import { hmacHex } from './crypto.ts';

const API = 'https://api.razorpay.com/v1';

function authHeader(keyId, keySecret) {
  return 'Basic ' + btoa(`${keyId}:${keySecret}`);
}

async function rzpRequest(creds, path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: authHeader(creds.keyId, creds.keySecret),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = (data.error && (data.error.description || data.error.code)) || res.status;
    throw new Error(`RAZORPAY_ERROR:${desc}`);
  }
  return data;
}

// Checkout callback signature: HMAC-SHA256(order_id|payment_id, key_secret).
export async function verifyCheckoutSignature(keySecret, { orderId, paymentId, signature }) {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  return (await hmacHex(keySecret, `${orderId}|${paymentId}`)) === signature;
}

// Webhook signature: HMAC-SHA256(raw body, webhook secret) in x-razorpay-signature.
export async function verifyWebhookSignature(webhookSecret, rawBody, signatureHeader) {
  if (!webhookSecret || !signatureHeader || !rawBody) return false;
  return (await hmacHex(webhookSecret, rawBody)) === signatureHeader;
}

export async function createOrder(creds, { amountMinor, currency, receipt, notes }) {
  return rzpRequest(creds, '/orders', 'POST', {
    amount: Math.round(amountMinor),
    currency,
    receipt,
    notes: notes || {},
  });
}

// Authoritative order state — do not trust the browser redirect.
export async function fetchOrder(creds, orderId) {
  return rzpRequest(creds, `/orders/${orderId}`, 'GET', null);
}

export async function fetchOrderPayments(creds, orderId) {
  return rzpRequest(creds, `/orders/${orderId}/payments`, 'GET', null);
}

// Razorpay Route transfer to a creator's Linked Account. Only valid after the
// underlying payment is captured — enforced by the caller, never here.
export async function createTransfer(creds, { amountMinor, currency, linkedAccountId, notes }) {
  return rzpRequest(creds, '/transfers', 'POST', {
    amount: Math.round(amountMinor),
    currency,
    account: linkedAccountId,
    notes: notes || {},
  });
}

export async function fetchTransfer(creds, transferId) {
  return rzpRequest(creds, `/transfers/${transferId}`, 'GET', null);
}