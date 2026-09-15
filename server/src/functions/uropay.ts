// @ts-nocheck
// UroPay — the India UPI collection flow.
//
// The ordering here is the same one the manual beta enforces, and for the same
// reason: a payment is not money until something authoritative says it is.
//
//   CLIENT asks to fund a contest
//   RAZEKIT creates a UroPay order (server to server, never from the browser)
//   CLIENT pays by UPI
//   UROPAY tells us something happened — a webhook, or the client's page polling
//   RAZEKIT ASKS UROPAY DIRECTLY what the order's status is    ← the only truth
//   COMPLETED, and only COMPLETED, credits the ledger
//
// Three things are deliberately NOT trusted:
//   • the browser coming back from the UPI app ("I paid!")
//   • a webhook body, even one with a valid signature
//   • a UTR the payer typed in
// Each of those only ever triggers an authoritative status lookup. That is what
// makes a replayed webhook, a double-click and a forged redirect all harmless.
//
// The ledger credit itself runs through settleFundingReceipt — the SAME
// function the admin's manual verification uses — so there is exactly one
// implementation of "this contest is now funded".
import { json } from './context.js';
import { withTransaction, lockRecord } from '../db.js';
import { serviceClient } from '../entities/service.js';
import { settleFundingReceipt } from './finance.js';
import { projectBalance } from '../finance/balances.js';
import {
  FUNDING, FUNDING_AWAITING_MONEY, assertFundingTransition, canTransitionFunding,
} from '../payments/states.js';
import { PAYMENT_STATE } from '../payments/gateway.js';
import {
  createUropayOrder, fetchUropayOrderStatus, submitUropayUtr,
  verifyUropayWebhook, webhookEnvironmentMatches, uropayConfigured, uropayEnv,
  uropayLive, uropayHealth, needsProviderReview, UROPAY_STATUS, UropayError,
} from '../payments/uropay.js';
import { emitEvent } from '../notify/emit.js';

const err = (code, message, status = 400) => json({ error: { code, message } }, status);
const nowIso = () => new Date().toISOString();

/** The actor recorded on a settlement RazeKit performed without a human. */
const SYSTEM_ACTOR = 'system:uropay';

/**
 * Walk a funding request up to PENDING_VERIFICATION along legal edges only.
 *
 * A provider-confirmed payment goes through exactly the same states a manual
 * bank transfer does, and that is deliberate. UroPay telling us a payment
 * happened is a CLAIM — the same kind of claim a client makes when they report
 * a transfer — and our authoritative status lookup is the CHECK. Letting the
 * automated path jump straight to VERIFIED would exempt it from an invariant
 * the manual path is held to, and the funding history would no longer show
 * where the assertion came from.
 *
 * Only legal edges are taken, so a request that is already further along (or
 * sitting in a state that needs a human, like NEEDS_INFORMATION) is left where
 * it is rather than being dragged forward.
 */
async function advanceToVerification(svc, funding) {
  let current = funding;
  for (const next of [FUNDING.PAYMENT_INSTRUCTIONS_SHOWN, FUNDING.TRANSFER_REPORTED, FUNDING.PENDING_VERIFICATION]) {
    if (current.status === next) continue;
    if (!canTransitionFunding(current.status, next)) continue;
    current = await svc.entities.ContestFunding.update(current.id, {
      status: next,
      ...(next === FUNDING.TRANSFER_REPORTED
        ? {
            reported_at: current.reported_at || nowIso(),
            reported_method: 'UPI',
            // Recorded as the provider's assertion, not the client's, so the
            // funding history says who claimed the money arrived.
            reported_note: 'Reported by UroPay (UPI provider notification).',
          }
        : {}),
    });
  }
  return current;
}

/**
 * Is UroPay usable right now? Safe for any caller — it names no credential.
 */
export async function uropayAvailability(ctx) {
  const configured = uropayConfigured();
  return json({
    provider: 'uropay',
    environment: uropayEnv(),
    available: configured,
    // In test mode the provider works end to end but moves no real money, and
    // a client is entitled to know that before they try to pay.
    live: uropayLive(),
    rails: ['UPI'],
    notice: !configured
      ? 'UPI payment is not available yet. Contest funding is by bank transfer with manual verification.'
      : uropayLive()
        ? 'Pay by UPI. Your contest is funded once the payment is confirmed with the provider.'
        : 'UPI payment is running in test mode. No real money moves, and no contest will be funded from a test payment.',
  });
}

// ── Order creation ──────────────────────────────────────────────────────────

/**
 * Create (or re-use) the UroPay order for a funding request.
 *
 * Re-use is the point: a client who reloads the page, double-taps, or comes
 * back tomorrow must land on the SAME order. A second order for the same
 * funding request is a second way to pay the same prize, which is how a brand
 * ends up paying twice.
 */
export async function uropayCreateOrder(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  if (!uropayConfigured()) {
    return err('UROPAY_UNAVAILABLE', 'UPI payment is not available yet. Use bank transfer instead.', 503);
  }

  const fundingId = (ctx.body || {}).funding_id;
  if (!fundingId) return err('FUNDING_ID_REQUIRED', 'funding_id is required.');

  const funding = await ctx.svc.entities.ContestFunding.get(fundingId).catch(() => null);
  if (!funding) return err('FUNDING_NOT_FOUND', 'Funding request not found.', 404);
  // Ownership from the row, never from the request.
  if (funding.brand_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'This funding request belongs to another account.', 403);
  }
  if (!FUNDING_AWAITING_MONEY.includes(funding.status) && funding.status !== FUNDING.TRANSFER_REPORTED) {
    return err('NOT_AWAITING_PAYMENT', `This funding request is ${funding.status} and is not waiting for a payment.`, 409);
  }

  // An existing live order for this funding request wins.
  const existing = await ctx.svc.entities.Payment
    .filter({ provider: 'uropay', reference: funding.reference }, '-created_date', 5).catch(() => []);
  const reusable = existing.find((p) => p.provider_order_id
    && ![PAYMENT_STATE.FAILED, PAYMENT_STATE.EXPIRED, PAYMENT_STATE.CANCELLED].includes(p.status));
  if (reusable) {
    const live = await fetchUropayOrderStatus(reusable.provider_order_id).catch(() => null);
    return json({
      reused: true,
      payment_id: reusable.id,
      provider_order_id: reusable.provider_order_id,
      upi_string: reusable.quote_snapshot?.upi_string || null,
      qr_code: reusable.quote_snapshot?.qr_code || null,
      amount_minor: reusable.total_minor,
      currency: reusable.currency,
      state: live?.state || reusable.status,
      provider_status: live?.provider_status || null,
    });
  }

  const client = await ctx.svc.entities.User.get(funding.brand_id).catch(() => null);
  let order;
  try {
    order = await createUropayOrder({
      amountMinor: Number(funding.total_amount_minor),
      // Our reference is the merchant order id, which is what makes a retry at
      // the provider resolve to one order rather than two.
      merchantOrderId: funding.reference,
      customerName: client?.full_name || 'RazeKit client',
      customerEmail: client?.email || '',
      transactionNote: `RazeKit contest funding ${funding.reference}`,
      notes: { funding_id: funding.id, contest_id: funding.contest_id },
    });
  } catch (e) {
    if (e instanceof UropayError) return err(e.code, e.message, e.status);
    return err('UROPAY_ORDER_FAILED', 'The UPI order could not be created. Nothing was charged.', 502);
  }

  const payment = await ctx.svc.entities.Payment.create({
    provider: 'uropay',
    provider_order_id: order.provider_order_id,
    reference: funding.reference,
    contest_id: funding.contest_id,
    brand_id: funding.brand_id,
    currency: funding.currency,
    subtotal_minor: Number(funding.prize_amount_minor),
    platform_fee_minor: Number(funding.platform_fee_minor || 0),
    tax_minor: Number(funding.tax_minor || 0),
    total_minor: Number(funding.total_amount_minor),
    status: order.state,
    market: 'IN',
    // One order per funding request per environment. If the store enforces a
    // unique index on this later, a duplicate create fails loudly rather than
    // quietly creating a second way to pay.
    idempotency_key: `uropay:${uropayEnv()}:${funding.reference}`,
    // The QR and UPI string are display data for this one order, not money.
    quote_snapshot: { upi_string: order.upi_string, qr_code: order.qr_code },
  });

  await ctx.svc.entities.ContestFunding.update(funding.id, {
    payment_mode: 'UROPAY',
    instructions_shown_at: funding.instructions_shown_at || nowIso(),
    status: FUNDING_AWAITING_MONEY.includes(funding.status)
      ? assertFundingTransition(funding.status, FUNDING.PAYMENT_INSTRUCTIONS_SHOWN)
      : funding.status,
  }).catch(() => null);

  return json({
    reused: false,
    payment_id: payment.id,
    provider_order_id: order.provider_order_id,
    upi_string: order.upi_string,
    qr_code: order.qr_code,
    amount_minor: Number(funding.total_amount_minor),
    currency: funding.currency,
    state: order.state,
    provider_status: order.provider_status,
    test_mode: !uropayLive(),
  });
}

// ── The one settlement path ─────────────────────────────────────────────────

/**
 * Ask UroPay what really happened, and credit the ledger if — and only if — the
 * provider says COMPLETED.
 *
 * Called from the client's polling, from the webhook, and from an admin
 * refresh. All three converge here so there is one answer to "is it paid?".
 *
 * Idempotent by construction: the provider order id is used as the receipt's
 * bank reference, and settleFundingReceipt refuses a reference it has already
 * credited. Two webhooks and a poll arriving together therefore produce one
 * credit, not three.
 */
export async function settleUropayOrder(svc, { providerOrderId, reason = 'poll' }) {
  const payments = await svc.entities.Payment
    .filter({ provider: 'uropay', provider_order_id: providerOrderId }, '-created_date', 1).catch(() => []);
  const payment = payments[0];
  if (!payment) return { ok: false, code: 'UNKNOWN_ORDER' };

  const live = await fetchUropayOrderStatus(providerOrderId);

  // Record what the provider said, whatever it said. A payment that never
  // completes still needs a trail showing we asked.
  await svc.entities.Payment.update(payment.id, {
    status: live.state,
    failure_reason: live.state === PAYMENT_STATE.FAILED ? live.provider_status : null,
    captured_at: live.state === PAYMENT_STATE.PAID ? (payment.captured_at || nowIso()) : payment.captured_at,
  }).catch(() => null);

  if (live.state !== PAYMENT_STATE.PAID) {
    return {
      ok: true, credited: false, state: live.state,
      provider_status: live.provider_status,
      needs_review: live.needs_review,
      reason,
    };
  }

  // From here the provider has confirmed. Find the funding request and settle
  // it under a lock, through the shared implementation.
  const fundings = await svc.entities.ContestFunding
    .filter({ reference: payment.reference }, '-created_date', 1).catch(() => []);
  if (!fundings[0]) return { ok: false, code: 'FUNDING_NOT_FOUND', state: live.state };

  const outcome = await withTransaction(async (tx) => {
    const txSvc = serviceClient(tx);
    await lockRecord(tx, fundings[0].id);
    const funding = await txSvc.entities.ContestFunding.get(fundings[0].id).catch(() => null);
    if (!funding) return { conflict: 'FUNDING_NOT_FOUND' };
    if (funding.status === FUNDING.VERIFIED || funding.status === FUNDING.OVERPAID) {
      return { already: true, funding };
    }

    // Same states as a manual transfer, walked under the same lock.
    const ready = await advanceToVerification(txSvc, funding);
    if (ready.status !== FUNDING.PENDING_VERIFICATION) {
      // It needs a person — NEEDS_INFORMATION, or a state this path must not
      // force. Recording that is more useful than failing silently.
      return { conflict: `NOT_SETTLEABLE:${ready.status}` };
    }

    return await settleFundingReceipt(txSvc, {
      funding: ready,
      actorId: SYSTEM_ACTOR,
      // The provider's order id IS the idempotency key for this credit.
      bankReference: providerOrderId,
      amountMinor: Number(payment.total_minor),
      // A UPI collection either arrives in full or it does not arrive; there is
      // no partial UPI payment to accept against this order.
      acceptPartial: false,
      receivedDate: nowIso().slice(0, 10),
      note: `Confirmed by UroPay status lookup (${live.provider_status}).`,
      provider: 'uropay',
      providerStatus: live.provider_status,
    });
  });

  if (outcome?.already) {
    return { ok: true, credited: false, already: true, state: live.state };
  }
  if (outcome?.conflict) {
    return { ok: false, code: outcome.conflict.json?.error?.code || outcome.conflict, state: live.state };
  }

  // Outside the transaction: a projection or a notification failing must never
  // roll back a committed credit.
  const f = outcome.funding;
  await projectBalance(svc, { userId: f.brand_id, currency: f.currency, role: 'client' }).catch(() => null);
  await emitEvent(svc, 'funding_verified', {
    recipientId: f.brand_id,
    contestId: f.contest_id,
    dedupeKey: `uropay:funded:${f.id}`,
  }).catch(() => null);

  return { ok: true, credited: true, state: live.state, funding_id: f.id, published: outcome.published };
}

// ── Client-facing status ────────────────────────────────────────────────────

export async function uropayOrderStatus(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const orderId = (ctx.body || {}).provider_order_id;
  if (!orderId) return err('ORDER_ID_REQUIRED', 'provider_order_id is required.');

  const rows = await ctx.svc.entities.Payment
    .filter({ provider: 'uropay', provider_order_id: orderId }, '-created_date', 1).catch(() => []);
  const payment = rows[0];
  if (!payment) return err('ORDER_NOT_FOUND', 'That payment was not found.', 404);
  if (payment.brand_id !== ctx.user.id && ctx.user.role !== 'admin') {
    return err('FORBIDDEN', 'That payment belongs to another account.', 403);
  }

  let result;
  try {
    result = await settleUropayOrder(ctx.svc, { providerOrderId: orderId, reason: 'client_poll' });
  } catch (e) {
    if (e instanceof UropayError) return err(e.code, e.message, e.status);
    return err('UROPAY_STATUS_FAILED', 'We could not check that payment just now. Nothing changed.', 502);
  }

  return json({
    provider_order_id: orderId,
    state: result.state || payment.status,
    credited: Boolean(result.credited),
    // Said plainly rather than left for the user to infer from a spinner.
    message: result.credited
      ? 'Payment confirmed. Your contest is funded.'
      : result.needs_review
        ? 'Your payment is with the provider for review. We will update this as soon as it is confirmed.'
        : result.state === PAYMENT_STATE.FAILED
          ? 'That payment did not go through. No money was taken.'
          : 'We have not seen a confirmed payment yet.',
  });
}

/**
 * Attach the payer's UPI reference to the order.
 *
 * This does NOT confirm anything. It gives UroPay a reference to match against,
 * and we then re-ask for the authoritative status — a typed UTR is a claim.
 */
export async function uropaySubmitUtr(ctx) {
  if (!ctx.user) return err('UNAUTHORIZED', 'Sign in to continue.', 401);
  const b = ctx.body || {};
  const orderId = b.provider_order_id;
  const reference = String(b.reference_number || '').trim();
  if (!orderId) return err('ORDER_ID_REQUIRED', 'provider_order_id is required.');
  if (reference.length < 6) {
    return err('REFERENCE_REQUIRED', 'Enter the UPI reference number exactly as your payment app shows it.');
  }

  const rows = await ctx.svc.entities.Payment
    .filter({ provider: 'uropay', provider_order_id: orderId }, '-created_date', 1).catch(() => []);
  if (!rows[0]) return err('ORDER_NOT_FOUND', 'That payment was not found.', 404);
  if (rows[0].brand_id !== ctx.user.id) return err('FORBIDDEN', 'That payment belongs to another account.', 403);

  try {
    await submitUropayUtr({ uroPayOrderId: orderId, referenceNumber: reference });
  } catch (e) {
    if (e instanceof UropayError) return err(e.code, e.message, e.status);
    return err('UTR_SUBMIT_FAILED', 'That reference could not be submitted. Nothing changed.', 502);
  }

  const result = await settleUropayOrder(ctx.svc, { providerOrderId: orderId, reason: 'utr_submitted' })
    .catch(() => ({ state: null, credited: false }));

  return json({
    submitted: true,
    state: result.state,
    credited: Boolean(result.credited),
    message: result.credited
      ? 'Payment confirmed. Your contest is funded.'
      : 'Thanks — your reference is with the provider. We will confirm as soon as the payment is matched.',
  });
}

// ── Webhook ─────────────────────────────────────────────────────────────────

/**
 * UroPay's webhook endpoint. PUBLIC by necessity, which is why it trusts
 * nothing in the body beyond an order id to go and ask about.
 *
 * Every delivery is recorded — including ones that fail signature verification,
 * because a stream of bad signatures is exactly the signal an operator needs to
 * see, and swallowing it would hide an attack in progress.
 */
export async function uropayWebhook(ctx) {
  const payload = ctx.body || {};
  const headers = ctx.req?.headers || {};
  const signature = headers['x-uropay-signature'] || headers['X-Uropay-Signature'] || '';

  const check = verifyUropayWebhook({ payload, signature });
  const eventId = String(payload.uroPayOrderId || '') + ':' + String(payload.event || '') + ':'
    + String(payload.orderStatus || payload.referenceNumber || '');

  const record = async (status, summary) => {
    await ctx.svc.entities.ProviderWebhookEvent.create({
      provider: 'uropay',
      event_id: eventId,
      event_type: String(payload.event || 'unknown'),
      signature_valid: check.valid,
      status,
      summary,
      related_ref: String(payload.merchantOrderId || payload.uroPayOrderId || ''),
    }).catch(() => null);
  };

  if (!check.valid) {
    await record('rejected', `Signature rejected: ${check.reason}.`);
    // A deliberately vague 401: an attacker probing the signature scheme learns
    // nothing about which part of their forgery was wrong.
    return err('INVALID_SIGNATURE', 'Signature verification failed.', 401);
  }
  if (!webhookEnvironmentMatches(payload)) {
    await record('rejected', `Environment mismatch: event claimed ${payload.environment}, this service runs ${uropayEnv()}.`);
    return err('ENVIRONMENT_MISMATCH', 'This event is for a different environment.', 409);
  }

  const orderId = payload.uroPayOrderId;
  if (!orderId) {
    await record('ignored', 'No order id in payload.');
    return json({ received: true, acted: false });
  }

  // Replay protection: the same event id, already processed, is acknowledged
  // and dropped. Acknowledging matters — a 4xx would make the provider retry
  // forever on an event we have already handled correctly.
  const seen = await ctx.svc.entities.ProviderWebhookEvent
    .filter({ provider: 'uropay', event_id: eventId, status: 'processed' }, '-created_date', 1).catch(() => []);
  if (seen.length) {
    await record('duplicate', 'Already processed; no second settlement attempted.');
    return json({ received: true, acted: false, duplicate: true });
  }

  let result;
  try {
    // The webhook is a PROMPT to check, never the answer.
    result = await settleUropayOrder(ctx.svc, { providerOrderId: orderId, reason: `webhook:${payload.event}` });
  } catch (e) {
    if (process.env.UROPAY_DEBUG) console.error('[uropay webhook] ', e);
    await record('error', `Status lookup failed: ${e?.code || e?.message || 'unknown'}.`);
    // 200 with acted:false: the event was genuine, we simply could not act yet.
    // Returning 5xx would be honest too, but invites a retry storm against a
    // provider that is already unreachable.
    return json({ received: true, acted: false, retry_later: true });
  }

  await record('processed', result.credited
    ? `Credited funding ${result.funding_id}.`
    : `Verified with provider; state ${result.state}. No credit.`);

  return json({ received: true, acted: true, credited: Boolean(result.credited) });
}

// ── Admin ───────────────────────────────────────────────────────────────────

/** Provider health for the admin console. Contains no credential. */
export async function uropayAdminHealth(ctx) {
  if (!ctx.user || ctx.user.role !== 'admin') return err('FORBIDDEN', 'Admin only.', 403);

  const [recent, webhooks] = await Promise.all([
    ctx.svc.entities.Payment.filter({ provider: 'uropay' }, '-created_date', 100).catch(() => []),
    ctx.svc.entities.ProviderWebhookEvent.filter({ provider: 'uropay' }, '-created_date', 100).catch(() => []),
  ]);

  const byState = {};
  for (const p of recent) byState[p.status] = (byState[p.status] || 0) + 1;

  // A provider is reachable or it is not; saying "healthy" without asking would
  // be the System Health page inventing its own good news.
  let reachable = null;
  let reachableError = null;
  const probe = recent.find((p) => p.provider_order_id);
  if (probe) {
    try { await fetchUropayOrderStatus(probe.provider_order_id); reachable = true; }
    catch (e) { reachable = false; reachableError = e?.code || 'unknown'; }
  }

  return json({
    ...uropayHealth(),
    reachable,
    reachable_error: reachableError,
    orders_seen: recent.length,
    orders_by_state: byState,
    awaiting_provider_review: recent.filter((p) => p.status === PAYMENT_STATE.PROCESSING).length,
    webhooks_received: webhooks.length,
    webhooks_rejected: webhooks.filter((w) => w.signature_valid === false).length,
  });
}

/** Admin refresh of one order — the same authoritative path, on demand. */
export async function uropayAdminRefresh(ctx) {
  if (!ctx.user || ctx.user.role !== 'admin') return err('FORBIDDEN', 'Admin only.', 403);
  const orderId = (ctx.body || {}).provider_order_id;
  if (!orderId) return err('ORDER_ID_REQUIRED', 'provider_order_id is required.');
  try {
    const result = await settleUropayOrder(ctx.svc, { providerOrderId: orderId, reason: 'admin_refresh' });
    return json(result);
  } catch (e) {
    if (e instanceof UropayError) return err(e.code, e.message, e.status);
    return err('REFRESH_FAILED', 'The refresh could not be completed. Nothing changed.', 502);
  }
}

export { UROPAY_STATUS, needsProviderReview };
