// @ts-nocheck
// Ported from base44/functions/{paymentQuote,paymentCreate,paymentConfirm,payoutCreate}.
// createClientFromRequest → ctx (ctx.user, ctx.svc service-role, ctx.body).
import { secrets } from '../secrets.js';
import { json } from './context.js';
import { MARKETS, marketForContest, contestCurrency, validateCurrencyForMarket } from '../money/markets.js';
import { toMinor, makeRef } from '../money/core.js';
import { computeQuote, activeRule } from '../money/fees.js';
import { readCreds, routePayment, routePayout } from '../money/router.js';
import {
  createOrder, createCheckoutSession, verifyCheckoutSignature, fetchOrder, fetchOrderPayments,
} from '../money/providers/razorpay.js';
import { createCheckoutSession as stripeCheckout, fetchSession, createTransfer as stripeTransfer } from '../money/providers/stripe.js';
import { createTransfer as razorpayTransfer } from '../money/providers/razorpay.js';
import {
  createOrder as paypalCreateOrder, captureOrder as paypalCaptureOrder,
  fetchOrder as paypalFetchOrder, captureIdFromOrder as paypalCaptureId,
  createPayout as paypalCreatePayout,
} from '../money/providers/paypal.js';
import { settleCapturedPayment } from '../money/settlement.js';

const paypalCreds = (creds) => ({ clientId: creds.paypalClientId, clientSecret: creds.paypalClientSecret, env: creds.paypalEnv });

const QUOTE_TTL_MINUTES = 15;

// ── POST paymentQuote ─────────────────────────────────────────────────────────
export async function paymentQuote(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const contestId = ctx.body.contest_id;
  if (!contestId) return json({ error: 'contest_id is required' }, 400);

  const svc = ctx.svc;
  const contest = await svc.entities.Contest.get(contestId);
  if (contest.created_by_id !== user.id) return json({ error: 'Forbidden' }, 403);

  const market = marketForContest(contest);
  const currency = contestCurrency(contest);
  const valid = validateCurrencyForMarket(market.key, currency);
  if (!valid.ok) return json({ error: valid }, 400);

  const captured = await svc.entities.Payment.filter({ contest_id: contestId, status: 'CAPTURED' }, '-created_date', 1);
  if (captured.length) {
    return json({ error: { code: 'ALREADY_FUNDED', message: 'This contest is already funded — its financial terms are locked.' } }, 409);
  }

  const subtotalMinor = toMinor(contest.prize_amount, currency);
  const rules = await svc.entities.MoneyRule.filter({ market: market.key, currency, active: true });
  const quote = computeQuote({
    subtotalMinor,
    currency,
    platformRule: activeRule(rules, 'PLATFORM_FEE', market.key, currency),
    processingRule: activeRule(rules, 'PROCESSING_FEE', market.key, currency),
    taxRule: activeRule(rules, 'TAX', market.key, currency),
    discountMinor: 0,
  });

  const reference = makeRef('RK-QUOTE');
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString();
  const record = await svc.entities.PaymentQuote.create({
    reference, contest_id: contestId, brand_id: user.id, market: market.key, currency,
    subtotal_minor: quote.subtotalMinor, platform_fee_minor: quote.platformFeeMinor,
    processing_fee_minor: quote.processingFeeMinor, tax_minor: quote.taxMinor,
    discount_minor: quote.discountMinor, total_minor: quote.totalMinor,
    fee_rule_version: quote.feeRuleVersion, fee_percentage_bps: quote.feePercentageBps,
    tax_rule_version: quote.taxRuleVersion, status: 'ACTIVE', expires_at: expiresAt,
  });

  return json({
    quote_id: record.id, reference, contest_id: contestId,
    market: { key: market.key, label: market.label }, ...quote, expires_at: expiresAt,
  });
}

// ── POST paymentCreate ────────────────────────────────────────────────────────
export async function paymentCreate(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const { quote_id: quoteId, idempotency_key: idempotencyKey, origin = '' } = ctx.body;
  if (!quoteId || !idempotencyKey) return json({ error: 'quote_id and idempotency_key are required' }, 400);

  const svc = ctx.svc;
  const existing = await svc.entities.Payment.filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
  if (existing.length) return json({ payment_id: existing[0].id, reference: existing[0].reference, idempotent: true });

  const quote = await svc.entities.PaymentQuote.get(quoteId);
  if (quote.brand_id !== user.id) return json({ error: 'Forbidden' }, 403);
  if (quote.status !== 'ACTIVE') return json({ error: { code: 'QUOTE_NOT_ACTIVE', message: 'This quote was already used or expired.' } }, 409);
  if (new Date(quote.expires_at).getTime() < Date.now()) {
    await svc.entities.PaymentQuote.update(quote.id, { status: 'EXPIRED' });
    return json({ error: { code: 'QUOTE_EXPIRED', message: 'This quote expired — request a new one.' } }, 410);
  }

  const contest = await svc.entities.Contest.get(quote.contest_id);
  if (contest.created_by_id !== user.id) return json({ error: 'Forbidden' }, 403);
  const captured = await svc.entities.Payment.filter({ contest_id: contest.id, status: 'CAPTURED' }, '-created_date', 1);
  if (captured.length) return json({ error: { code: 'ALREADY_FUNDED', message: 'This contest is already funded.' } }, 409);

  const market = MARKETS[quote.market];
  const valid = validateCurrencyForMarket(market.key, quote.currency);
  if (!valid.ok) return json({ error: valid }, 400);
  const creds = readCreds(secrets);
  const route = routePayment(market, quote.currency, creds);
  if (!route.ok) return json({ error: route }, 503);

  const reference = makeRef('RK-PAY');
  const payment = await svc.entities.Payment.create({
    reference, brand_id: user.id, contest_id: quote.contest_id, market: quote.market, currency: quote.currency,
    subtotal_minor: quote.subtotal_minor, platform_fee_minor: quote.platform_fee_minor,
    processing_fee_minor: quote.processing_fee_minor, tax_minor: quote.tax_minor,
    discount_minor: quote.discount_minor, total_minor: quote.total_minor,
    fee_rule_version: quote.fee_rule_version, fee_percentage_bps: quote.fee_percentage_bps,
    tax_rule_version: quote.tax_rule_version, quote_id: quote.id, quote_snapshot: JSON.stringify(quote),
    provider: route.provider, status: 'CREATED', idempotency_key: idempotencyKey,
  });
  await svc.entities.PaymentQuote.update(quote.id, { status: 'CONSUMED', consumed_by_payment_id: payment.id });

  let checkout;
  try {
    if (route.provider === 'razorpay') {
      const order = await createOrder(
        { keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret },
        { amountMinor: quote.total_minor, currency: quote.currency, receipt: reference, notes: { reference, contest_id: quote.contest_id } }
      );
      await svc.entities.Payment.update(payment.id, { status: 'PENDING', provider_order_id: order.id });
      checkout = { provider: 'razorpay', key_id: creds.razorpayKeyId, order_id: order.id, amount_minor: quote.total_minor, currency: quote.currency };
    } else if (route.provider === 'paypal') {
      const order = await paypalCreateOrder(paypalCreds(creds), {
        amountMinor: quote.total_minor, currency: quote.currency, reference,
        returnUrl: `${origin}/contest/${quote.contest_id}/fund?paypal_return=1`,
        cancelUrl: `${origin}/contest/${quote.contest_id}/fund?payment=cancelled`,
      });
      if (!order.approveUrl) throw new Error('PayPal did not return an approval URL');
      await svc.entities.Payment.update(payment.id, { status: 'PENDING', provider_order_id: order.id });
      checkout = { provider: 'paypal', redirect_url: order.approveUrl, order_id: order.id, paypal_env: creds.paypalEnv };
    } else {
      const session = await stripeCheckout(
        { secretKey: creds.stripeSecretKey },
        { amountMinor: quote.total_minor, currency: quote.currency, reference, contestId: quote.contest_id,
          successUrl: `${origin}/contest/${quote.contest_id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/contest/${quote.contest_id}?payment=cancelled` }
      );
      await svc.entities.Payment.update(payment.id, { status: 'PENDING', provider_order_id: session.id });
      checkout = { provider: 'stripe', redirect_url: session.url, session_id: session.id };
    }
  } catch (e) {
    // Provider rejected order creation (e.g. restricted account, bad key). Record
    // it and return a friendly error rather than a 500 — the quote is consumed but
    // no money moved, and the brand can retry with a fresh quote.
    const reason = String(e.message || e).replace(/^PAYPAL_ERROR:|^RAZORPAY_ERROR:|^STRIPE_ERROR:/, '').slice(0, 300);
    await svc.entities.Payment.update(payment.id, { status: 'FAILED', failure_reason: reason }).catch(() => {});
    return json({ error: { code: 'PROVIDER_ERROR', message: `The payment provider could not start this payment (${reason}). Your contest is saved — please try again.` } }, 502);
  }

  return json({ payment_id: payment.id, reference, ...checkout });
}

// ── POST paymentConfirm ───────────────────────────────────────────────────────
export async function paymentConfirm(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const body = ctx.body;
  const svc = ctx.svc;

  let payment;
  const paypalOrderId = body.paypal && (body.paypal.order_id || body.paypal.token);
  if (body.payment_id) payment = await svc.entities.Payment.get(body.payment_id);
  else if (body.reference) {
    const list = await svc.entities.Payment.filter({ reference: body.reference }, '-created_date', 1);
    if (!list.length) return json({ error: 'Payment not found' }, 404);
    payment = list[0];
  } else if (paypalOrderId) {
    // PayPal redirect return — locate the pending payment by its order id.
    const list = await svc.entities.Payment.filter({ provider_order_id: paypalOrderId }, '-created_date', 1);
    if (!list.length) return json({ error: 'Payment not found' }, 404);
    payment = list[0];
  } else return json({ error: 'payment_id or reference is required' }, 400);

  if (payment.brand_id !== user.id && user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
  if (payment.status === 'CAPTURED') return json({ status: 'CAPTURED', reference: payment.reference, captured: true });

  const creds = readCreds(secrets);

  if (payment.provider === 'razorpay') {
    const rz = body.razorpay || {};
    const orderId = rz.order_id || rz.razorpay_order_id;
    const paymentId = rz.payment_id || rz.razorpay_payment_id;
    const signature = rz.signature || rz.razorpay_signature;
    if (orderId && paymentId && signature) {
      const valid = await verifyCheckoutSignature(creds.razorpayKeySecret, { orderId, paymentId, signature });
      if (!valid) {
        await svc.entities.Payment.update(payment.id, { status: 'FAILED', failure_reason: 'Checkout signature verification failed' });
        return json({ error: { code: 'VERIFICATION_FAILED', message: "Payment couldn't be verified." } }, 400);
      }
      await svc.entities.Payment.update(payment.id, { provider_payment_id: paymentId, status: 'AUTHORIZED' });
    } else {
      const order = await fetchOrder({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, payment.provider_order_id);
      if (order.status !== 'paid' && order.status !== 'captured') return json({ status: 'PENDING', provider_status: order.status });
      const orderPayments = await fetchOrderPayments({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, order.id);
      const capturedPayment = (orderPayments.items || orderPayments || []).find?.((p) => p.status === 'captured');
      await svc.entities.Payment.update(payment.id, { provider_payment_id: (capturedPayment && capturedPayment.id) || null, status: 'AUTHORIZED' });
    }
  } else if (payment.provider === 'paypal') {
    const pc = paypalCreds(creds);
    const orderId = paypalOrderId || payment.provider_order_id;
    let order = await paypalFetchOrder(pc, orderId);
    // Capture once the payer has approved; treat an already-captured order as success (idempotent).
    if (order.status !== 'COMPLETED') {
      if (['APPROVED', 'PAYER_ACTION_REQUIRED', 'CREATED', 'SAVED'].includes(order.status)) {
        try {
          order = await paypalCaptureOrder(pc, orderId);
        } catch (e) {
          order = await paypalFetchOrder(pc, orderId).catch(() => order);
          if (order.status !== 'COMPLETED') {
            await svc.entities.Payment.update(payment.id, { status: 'FAILED', failure_reason: String(e.message).slice(0, 300) });
            return json({ error: { code: 'VERIFICATION_FAILED', message: "PayPal payment couldn't be captured." } }, 400);
          }
        }
      }
    }
    if (order.status !== 'COMPLETED') return json({ status: 'PENDING', provider_status: order.status });
    await svc.entities.Payment.update(payment.id, { provider_payment_id: paypalCaptureId(order), status: 'AUTHORIZED' });
  } else {
    const sessionId = (body.stripe && body.stripe.session_id) || payment.provider_order_id;
    const session = await fetchSession({ secretKey: creds.stripeSecretKey }, sessionId);
    if (session.payment_status !== 'paid') return json({ status: 'PENDING', provider_status: session.payment_status });
    await svc.entities.Payment.update(payment.id, { provider_payment_id: session.payment_intent, status: 'AUTHORIZED' });
  }

  const fresh = await svc.entities.Payment.get(payment.id);
  const contest = await svc.entities.Contest.get(payment.contest_id);
  await settleCapturedPayment(svc, { payment: fresh, contest });
  return json({ status: 'CAPTURED', reference: payment.reference, captured: true });
}

// ── POST payoutCreate (admin) ─────────────────────────────────────────────────
export async function payoutCreate(ctx) {
  const user = ctx.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
  const contestId = ctx.body.contest_id;
  if (!contestId) return json({ error: 'contest_id is required' }, 400);

  const svc = ctx.svc;
  const contest = await svc.entities.Contest.get(contestId);
  if (!contest.winner_user_id || !contest.winner_submission_id) {
    return json({ error: { code: 'NOT_PAYABLE', message: 'No winner has been selected for this contest yet.' } }, 409);
  }

  const existing = await svc.entities.Payout.filter({ contest_id: contestId }, '-created_date', 5);
  const active = existing.find((p) => ['PAYOUT_INITIATED', 'PAYOUT_PROCESSING', 'PAYOUT_COMPLETED'].includes(p.status));
  if (active) return json({ payout: active, idempotent: true });

  const payments = await svc.entities.Payment.filter({ contest_id: contestId, status: 'CAPTURED' }, '-created_date', 1);
  if (!payments.length) return json({ error: { code: 'NOT_PAYABLE', message: 'This contest has no captured funding payment.' } }, 409);
  const payment = payments[0];

  const market = marketForContest(contest);
  const currency = contestCurrency(contest);
  const valid = validateCurrencyForMarket(market.key, currency);
  if (!valid.ok) return json({ error: valid }, 400);

  const creds = readCreds(secrets);
  const route = routePayout(market, currency, creds);
  if (!route.ok) return json({ error: route }, 503);

  const reference = makeRef('RK-PAYOUT');
  const base = {
    reference, creator_id: contest.winner_user_id, brand_id: contest.created_by_id, contest_id: contestId,
    payment_id: payment.id, market: market.key, currency, amount_minor: payment.subtotal_minor,
    provider: route.provider, idempotency_key: `payout-${contestId}`,
  };

  const accounts = await svc.entities.PayoutAccount.filter({ user_id: contest.winner_user_id, provider: route.provider });
  const account = accounts.find((a) => a.payouts_enabled && a.onboarding_status === 'verified');
  if (!account) {
    const payout = await svc.entities.Payout.create({ ...base, status: 'ON_HOLD', failure_reason: 'Creator payout account is not onboarded/verified with the provider yet.' });
    await svc.entities.Notification.create({
      type: 'payment_received', title: 'Payout action required',
      description: `Your winner payout needs a verified payout account. Set up payouts to receive your prize.`,
      recipient_user_id: contest.winner_user_id, contest_id: contestId,
    }).catch(() => null);
    return json({ payout, error: { code: 'PAYOUT_ON_HOLD', message: 'Winner has no verified payout account — onboarding required before the payout can run.' } });
  }

  let payout = await svc.entities.Payout.create({ ...base, provider_account_id: account.provider_account_id, status: 'READY_FOR_PAYOUT' });
  try {
    let transfer;
    if (route.provider === 'razorpay') {
      transfer = await razorpayTransfer(
        { keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret },
        { amountMinor: payout.amount_minor, currency, linkedAccountId: account.provider_account_id, notes: { reference, contest_id: contestId } }
      );
    } else if (route.provider === 'paypal') {
      transfer = await paypalCreatePayout(paypalCreds(creds), {
        amountMinor: payout.amount_minor, currency, receiverEmail: account.provider_account_id, reference,
      });
    } else {
      transfer = await stripeTransfer(
        { secretKey: creds.stripeSecretKey },
        { amountMinor: payout.amount_minor, currency, connectedAccountId: account.provider_account_id, idempotencyKey: reference }
      );
    }
    payout = await svc.entities.Payout.update(payout.id, { status: 'PAYOUT_INITIATED', provider_transfer_id: transfer.id, initiated_at: new Date().toISOString() });
  } catch (e) {
    payout = await svc.entities.Payout.update(payout.id, { status: 'PAYOUT_FAILED', failure_reason: String(e.message).slice(0, 300) });
    return json({ payout, error: { code: 'PAYOUT_FAILED', message: 'The provider rejected the transfer — recorded for review.' } }, 502);
  }
  return json({ payout });
}
