// @ts-nocheck
// Razorpay provider — ported verbatim from base44/shared/money/providers/razorpay.ts.
import { hmacHex } from './crypto.js';

const API = 'https://api.razorpay.com/v1';

function authHeader(keyId, keySecret) {
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
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

export async function verifyCheckoutSignature(keySecret, { orderId, paymentId, signature, order_id, payment_id, razorpay_signature }) {
  const oid = orderId || order_id;
  const pid = paymentId || payment_id;
  const sig = signature || razorpay_signature;
  if (!keySecret || !oid || !pid || !sig) return false;
  return (await hmacHex(keySecret, `${oid}|${pid}`)) === sig;
}

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

export async function fetchOrder(creds, orderId) {
  return rzpRequest(creds, `/orders/${orderId}`, 'GET', null);
}

export async function fetchOrderPayments(creds, orderId) {
  return rzpRequest(creds, `/orders/${orderId}/payments`, 'GET', null);
}

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
