// @ts-nocheck
// The UroPay adapter — India UPI collection.
//
// UroPay is a UPI *collection* provider: the payer sends money by UPI to the
// merchant's own account, and UroPay tells us when it detects that. Three facts
// about the real API shape everything below, and each one is a capability we
// declare rather than assume:
//
//   1. There is NO refund endpoint.  Refunds stay admin-reviewed and manual.
//   2. There is NO payout endpoint.  Creator payouts stay on the manual beta.
//   3. It is UPI only.               There is no card rail to offer.
//
// Anything that claimed otherwise would be the product lying about where a
// user's money can go, so `capabilities` says no to all three.
//
// The second shaping fact: UroPay's own confirmation is partly human. Its
// REVIEW_REQUIRED and UTR_SUBMITTED states mean "a person still has to look at
// this". We map both to PROCESSING, never to PAID — a submitted UTR is a claim,
// and RazeKit has never created money from a claim.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { defineAdapter, registerAdapter, PAYMENT_STATE } from './gateway.js';

/** UroPay's own order statuses, as documented by the provider. */
export const UROPAY_STATUS = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  UTR_SUBMITTED: 'UTR_SUBMITTED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

/**
 * Provider status → RazeKit's normalized payment state.
 *
 * Only COMPLETED becomes PAID. UTR_SUBMITTED is the payer *claiming* a
 * reference number and REVIEW_REQUIRED is UroPay saying it could not decide —
 * treating either as paid would fund a contest on an unverified assertion.
 */
export function mapUropayStatus(status) {
  switch (String(status || '').toUpperCase()) {
    case UROPAY_STATUS.CREATED: return PAYMENT_STATE.CREATED;
    case UROPAY_STATUS.PENDING: return PAYMENT_STATE.PENDING;
    case UROPAY_STATUS.UPDATED: return PAYMENT_STATE.PROCESSING;
    case UROPAY_STATUS.UTR_SUBMITTED: return PAYMENT_STATE.PROCESSING;
    case UROPAY_STATUS.REVIEW_REQUIRED: return PAYMENT_STATE.PROCESSING;
    case UROPAY_STATUS.COMPLETED: return PAYMENT_STATE.PAID;
    case UROPAY_STATUS.FAILED: return PAYMENT_STATE.FAILED;
    case UROPAY_STATUS.CANCELLED: return PAYMENT_STATE.CANCELLED;
    // An unrecognised status is NOT success. A provider adding a new state must
    // never be able to silently widen what counts as paid.
    default: return PAYMENT_STATE.PENDING;
  }
}

/** A provider status still waiting on a human at UroPay's end. */
export function needsProviderReview(status) {
  const s = String(status || '').toUpperCase();
  return s === UROPAY_STATUS.REVIEW_REQUIRED || s === UROPAY_STATUS.UTR_SUBMITTED;
}

// ── Environment + credentials ───────────────────────────────────────────────
//
// TEST and PRODUCTION credentials are read from different variables and never
// fall back to one another. A missing production secret must fail closed, not
// quietly reach for the test key and take real money through a sandbox path
// (or, worse, the reverse).

export function uropayEnv() {
  const raw = String(process.env.UROPAY_ENV || 'test').toLowerCase();
  return raw === 'production' || raw === 'prod' ? 'production' : 'test';
}

function credentials() {
  const env = uropayEnv();
  return env === 'production'
    ? { env, key: process.env.UROPAY_PRODUCTION_KEY || '', secret: process.env.UROPAY_PRODUCTION_SECRET || '' }
    : { env, key: process.env.UROPAY_TEST_KEY || '', secret: process.env.UROPAY_TEST_SECRET || '' };
}

/**
 * Base URL, pinned to the provider by default.
 *
 * An override exists for a provider-supplied sandbox host, but it must be
 * https and is otherwise ignored — an attacker who could set this to plain http
 * or an internal address would be handed our API key on every request.
 */
export function uropayBaseUrl() {
  const override = String(process.env.UROPAY_BASE_URL || '').trim();
  if (override) {
    try {
      const u = new URL(override);
      if (u.protocol === 'https:') return override.replace(/\/+$/, '');
    } catch { /* fall through to the pinned default */ }
  }
  return 'https://api.uropay.me';
}

export function uropayConfigured() {
  const { key, secret } = credentials();
  return Boolean(key && secret);
}

/**
 * Production is opt-in twice: correct credentials AND an explicit enable flag.
 *
 * Merchant production access is something only the platform owner can obtain,
 * so the code refuses to move real money on the strength of an env var that
 * someone might have set while testing.
 */
export function uropayLive() {
  return uropayEnv() === 'production'
    && uropayConfigured()
    && String(process.env.UROPAY_PRODUCTION_ENABLED || '').toLowerCase() === 'true';
}

/**
 * UroPay authenticates with the API key plus a bearer token that is the SHA-512
 * of the shared secret. The raw secret is never transmitted and never logged.
 */
function authHeaders() {
  const { key, secret } = credentials();
  return {
    'X-API-KEY': key,
    Authorization: `Bearer ${createHash('sha512').update(secret, 'utf8').digest('hex')}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────────

/** Provider errors carry a code the caller can branch on without string matching. */
export class UropayError extends Error {
  constructor(code, message, status = 502, detail = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function call(path, { method = 'GET', body = null, auth = true, timeoutMs = 15000 } = {}) {
  if (auth && !uropayConfigured()) {
    throw new UropayError('UROPAY_NOT_CONFIGURED', 'UroPay credentials are not configured.', 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${uropayBaseUrl()}${path}`, {
      method,
      // The status endpoint is documented as needing no authorisation header;
      // sending credentials where they are not required only widens exposure.
      headers: auth ? authHeaders() : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: 'error',
    });
  } catch (e) {
    throw new UropayError(
      e?.name === 'AbortError' ? 'UROPAY_TIMEOUT' : 'UROPAY_UNREACHABLE',
      e?.name === 'AbortError' ? 'UroPay did not respond in time.' : 'Could not reach UroPay.',
      504,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* provider returned non-JSON */ }

  if (res.status === 429) {
    // 60 requests/minute per key. Surfaced as its own code so a caller can back
    // off rather than treating a rate limit as a payment failure.
    throw new UropayError('UROPAY_RATE_LIMITED', 'UroPay rate limit reached. Try again shortly.', 429);
  }
  if (!res.ok) {
    throw new UropayError('UROPAY_ERROR', `UroPay returned ${res.status}.`, 502, json?.message || null);
  }
  if (!json) {
    throw new UropayError('UROPAY_BAD_RESPONSE', 'UroPay returned an unreadable response.', 502);
  }
  return json;
}

// ── Order creation ──────────────────────────────────────────────────────────

/**
 * Create a UroPay order.
 *
 * `amountMinor` is paise, which is what UroPay's `amount` field already expects —
 * no conversion, and therefore no rounding bug at the boundary.
 *
 * `merchantOrderId` is OUR id. It is what makes a retry safe: the same RazeKit
 * funding reference sent twice is the same order at UroPay, not a second one.
 */
export async function createUropayOrder({
  amountMinor, merchantOrderId, customerName, customerEmail, transactionNote, notes,
}) {
  const amount = Math.round(Number(amountMinor));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new UropayError('INVALID_AMOUNT', 'Amount must be a positive number of paise.', 422);
  }
  if (!merchantOrderId) {
    throw new UropayError('INVALID_ORDER_REF', 'A merchant order reference is required.', 422);
  }

  const payload = {
    amount,
    merchantOrderId: String(merchantOrderId),
    customerName: String(customerName || 'RazeKit client').slice(0, 120),
    customerEmail: String(customerEmail || '').slice(0, 200),
    // Shown to the payer inside their UPI app, so it names the actual purpose.
    transactionNote: String(transactionNote || 'RazeKit contest funding').slice(0, 100),
    ...(process.env.UROPAY_VPA ? { vpa: process.env.UROPAY_VPA } : {}),
    ...(process.env.UROPAY_VPA_NAME ? { vpaName: process.env.UROPAY_VPA_NAME } : {}),
    ...(notes ? { notes } : {}),
  };

  const res = await call('/order/generate', { method: 'POST', body: payload });
  return {
    provider_order_id: res.uroPayOrderId || null,
    provider_status: res.orderStatus || UROPAY_STATUS.CREATED,
    state: mapUropayStatus(res.orderStatus || UROPAY_STATUS.CREATED),
    upi_string: res.upiString || null,
    qr_code: res.qrCode || null,
    amount_in_rupees: res.amountInRupees ?? amount / 100,
  };
}

/**
 * Authoritative order status.
 *
 * This — not a webhook, and certainly not the browser coming back from a
 * redirect — is what RazeKit believes. Everything else is a hint that it is
 * worth asking.
 */
export async function fetchUropayOrderStatus(uroPayOrderId) {
  if (!uroPayOrderId) throw new UropayError('INVALID_ORDER_REF', 'An order id is required.', 422);
  const res = await call(`/order/status/${encodeURIComponent(uroPayOrderId)}`, { auth: false });
  const provider_status = res.orderStatus || null;
  return {
    provider_order_id: res.uroPayOrderId || uroPayOrderId,
    provider_status,
    state: mapUropayStatus(provider_status),
    needs_review: needsProviderReview(provider_status),
  };
}

/** Attach a payer-supplied UPI reference (UTR) to an order. */
export async function submitUropayUtr({ uroPayOrderId, referenceNumber }) {
  if (!uroPayOrderId || !referenceNumber) {
    throw new UropayError('INVALID_UTR', 'An order id and reference number are required.', 422);
  }
  const res = await call('/order/update', {
    method: 'PATCH',
    body: { uroPayOrderId, referenceNumber: String(referenceNumber).trim() },
  });
  return {
    provider_order_id: res.uroPayOrderId || uroPayOrderId,
    provider_status: res.orderStatus || null,
    state: mapUropayStatus(res.orderStatus),
  };
}

// ── Webhook signature ───────────────────────────────────────────────────────
//
// UroPay signs with HMAC-SHA256 where the KEY is the SHA-512 of the shared
// secret and the DATA is the payload serialised with its keys in a
// provider-defined order. Key order is part of the signature, so it is spelled
// out per event type rather than left to object iteration order.

const TAIL_SMS = ['uroPayOrderId', 'merchantOrderId', 'detectedAt', 'environment'];
const ORDER_STATUS_CHANGED = ['event', 'uroPayOrderId', 'merchantOrderId', 'orderStatus', 'submittedUTR', 'environment'];
const ORDER_UTR_SUBMITTED = [
  'event', 'uroPayOrderId', 'merchantOrderId', 'orderStatus', 'submittedUTR', 'amount',
  'customerName', 'customerEmail', 'customerVPA', 'environment', 'utrSubmittedAt',
];

/** The exact key order UroPay signs, for a given event type. */
export function signingKeyOrder(payload) {
  const event = String(payload?.event || '');
  if (event === 'order.status.changed') return ORDER_STATUS_CHANGED;
  if (event === 'order.status.utrsubmitted') return ORDER_UTR_SUBMITTED;
  if (event === 'companion.sms.data') {
    // `event` first, the remaining keys alphabetically, then a fixed tail.
    const middle = Object.keys(payload)
      .filter((k) => k !== 'event' && !TAIL_SMS.includes(k))
      .sort();
    return ['event', ...middle, ...TAIL_SMS];
  }
  // An unknown event type is signed over its keys in a stable order so the
  // comparison is still deterministic — it simply will not match unless UroPay
  // happens to agree, which is the safe direction to fail in.
  return ['event', ...Object.keys(payload || {}).filter((k) => k !== 'event').sort()];
}

/**
 * Serialise like PHP's `json_encode` defaults, which is what the provider uses:
 * no spaces, forward slashes escaped as `\/`, non-ASCII escaped as \uXXXX.
 *
 * JavaScript's JSON.stringify does none of those three, so signing its output
 * would fail against any payload containing a URL — which every webhook
 * carrying a VPA or a note can contain.
 */
function phpJsonEncode(value) {
  const json = JSON.stringify(value);
  let out = '';
  // Walked by UTF-16 code unit rather than by code point: PHP emits a surrogate
  // PAIR as two \uXXXX escapes, so an emoji in a payer's name must be encoded the
  // same way here, or the signature silently stops matching for that one customer.
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    if (code === 0x2f) out += '\\/';
    else if (code > 0x7f) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += json[i];
  }
  return out;
}

function orderedPayload(payload, keys) {
  const out = {};
  for (const k of keys) if (payload[k] !== undefined) out[k] = payload[k];
  return out;
}

/** Every serialisation we are willing to accept as the signed representation. */
function candidateBodies(payload) {
  const keys = signingKeyOrder(payload);
  const ordered = orderedPayload(payload, keys);
  return [
    phpJsonEncode(ordered),
    // Same ordered payload without PHP's slash/unicode escaping, in case the
    // provider's encoder is configured with JSON_UNESCAPED_SLASHES.
    JSON.stringify(ordered),
  ];
}

function hmacHex(secret, body) {
  const key = createHash('sha512').update(secret, 'utf8').digest('hex');
  return createHmac('sha256', key).update(body, 'utf8').digest('hex');
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length || x.length === 0) return false;
  return timingSafeEqual(x, y);
}

/**
 * Verify an inbound webhook signature.
 *
 * Returns a reason on failure rather than throwing, because the caller must
 * record the rejected event for audit — a stream of bad signatures is a signal
 * worth seeing, not an exception to swallow.
 */
export function verifyUropayWebhook({ payload, signature }) {
  const { secret } = credentials();
  if (!secret) return { valid: false, reason: 'not_configured' };
  if (!signature) return { valid: false, reason: 'missing_signature' };
  if (!payload || typeof payload !== 'object') return { valid: false, reason: 'malformed_payload' };

  const provided = String(signature).trim().replace(/^sha256=/i, '');
  for (const body of candidateBodies(payload)) {
    if (safeEqualHex(hmacHex(secret, body), provided)) return { valid: true, reason: null };
  }
  return { valid: false, reason: 'signature_mismatch' };
}

/**
 * A webhook must be for the environment we are running as.
 *
 * Without this, a sandbox event could fund a production contest — the payload
 * carries `environment`, so there is no reason to guess.
 */
export function webhookEnvironmentMatches(payload) {
  const claimed = String(payload?.environment || '').toLowerCase();
  if (!claimed) return true; // provider omitted it; the signature still gated us
  const mine = uropayEnv();
  return claimed.startsWith(mine === 'production' ? 'prod' : 'test')
    || (mine === 'test' && claimed.startsWith('sand'));
}

// ── Adapter registration ────────────────────────────────────────────────────

export const uropayAdapter = defineAdapter({
  id: 'uropay',
  label: 'UroPay (UPI, India)',
  capabilities: {
    supportsPayment: true,
    // Both false because the provider genuinely has no such endpoint. Claiming
    // otherwise would put a refund button in front of a user that cannot work.
    supportsRefund: false,
    supportsPartialRefund: false,
    supportsPayout: false,
    supportsWebhook: true,
    supportedCurrencies: ['INR'],
    // UPI collection only — there is no card rail on this product.
    rails: ['UPI'],
    // UroPay's own confirmation can require a person, so the core must not
    // promise instant funding even when the provider is live.
    manualVerification: false,
    instantConfirmation: false,
    providerReviewPossible: true,
  },

  configured: () => uropayConfigured(),

  createPayment: async ({ amountMinor, currency, reference, customerName, customerEmail, notes }) => {
    if (String(currency || 'INR').toUpperCase() !== 'INR') {
      throw new UropayError('UNSUPPORTED_CURRENCY', 'UroPay settles in INR only.', 422);
    }
    const order = await createUropayOrder({
      amountMinor, merchantOrderId: reference, customerName, customerEmail, notes,
    });
    return { provider: 'uropay', ...order };
  },

  verifyPayment: async ({ providerOrderId }) => {
    const status = await fetchUropayOrderStatus(providerOrderId);
    return { provider: 'uropay', ...status };
  },

  // Deliberately null: the core checks for the function's existence before
  // offering the operation, so a null here is how "we cannot do this" is said.
  refund: null,
  payout: null,

  verifyWebhook: ({ payload, signature }) => verifyUropayWebhook({ payload, signature }),
  mapStatus: mapUropayStatus,
});

registerAdapter(uropayAdapter);

/** Operational summary for admin System Health. Never includes a secret. */
export function uropayHealth() {
  const env = uropayEnv();
  return {
    id: 'uropay',
    environment: env,
    configured: uropayConfigured(),
    production_enabled: uropayLive(),
    base_url: uropayBaseUrl(),
    capabilities: uropayAdapter.capabilities,
    // Stated plainly so nobody has to read the adapter to learn the limits.
    limitations: [
      'UPI collection only — UroPay provides no card rail.',
      'No refund API: refunds are reviewed and processed by an admin.',
      'No payout API: creator payouts run on the manual beta process.',
      'Provider confirmation can require manual review at UroPay before COMPLETED.',
    ],
  };
}
