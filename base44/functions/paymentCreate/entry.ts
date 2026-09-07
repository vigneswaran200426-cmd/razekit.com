// POST /payments/create — turns an ACTIVE quote into a provider order.
// Idempotent on idempotency_key: a retry (double-click, closed tab, reopened
// window) returns the SAME payment — never a second charge. Provider routing is
// capability-checked; an unconfigured provider is a structured failure, not a
// silent fallback.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { MARKETS, validateCurrencyForMarket } from '../../shared/money/markets.ts';
import { makeRef } from '../../shared/money/core.ts';
import { readCreds, routePayment } from '../../shared/money/router.ts';
import { createOrder } from '../../shared/money/providers/razorpay.ts';
import { createCheckoutSession } from '../../shared/money/providers/stripe.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const quoteId = body.quote_id;
    const idempotencyKey = body.idempotency_key;
    const origin = body.origin || '';
    if (!quoteId || !idempotencyKey) {
      return Response.json({ error: 'quote_id and idempotency_key are required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // ── Idempotency: same key → same payment, no duplicate order/charge.
    const existing = await svc.entities.Payment.filter({ idempotency_key: idempotencyKey }, '-created_date', 1);
    if (existing.length) {
      return Response.json({ payment_id: existing[0].id, reference: existing[0].reference, idempotent: true });
    }

    const quote = await svc.entities.PaymentQuote.get(quoteId);
    if (quote.brand_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (quote.status !== 'ACTIVE') {
      return Response.json({ error: { code: 'QUOTE_NOT_ACTIVE', message: 'This quote was already used or expired.' } }, { status: 409 });
    }
    if (new Date(quote.expires_at).getTime() < Date.now()) {
      await svc.entities.PaymentQuote.update(quote.id, { status: 'EXPIRED' });
      return Response.json({ error: { code: 'QUOTE_EXPIRED', message: 'This quote expired — request a new one.' } }, { status: 410 });
    }

    const contest = await svc.entities.Contest.get(quote.contest_id);
    if (contest.created_by_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
    const captured = await svc.entities.Payment.filter({ contest_id: contest.id, status: 'CAPTURED' }, '-created_date', 1);
    if (captured.length) {
      return Response.json({ error: { code: 'ALREADY_FUNDED', message: 'This contest is already funded.' } }, { status: 409 });
    }

    // ── Provider routing (market + currency + capability checks).
    const market = MARKETS[quote.market];
    const valid = validateCurrencyForMarket(market.key, quote.currency);
    if (!valid.ok) return Response.json({ error: valid }, { status: 400 });
    const creds = readCreds(secrets);
    const route = routePayment(market, quote.currency, creds);
    if (!route.ok) return Response.json({ error: route }, { status: 503 });

    // ── Payment record with the immutable calculation snapshot.
    const reference = makeRef('RK-PAY');
    const payment = await svc.entities.Payment.create({
      reference,
      brand_id: user.id,
      contest_id: quote.contest_id,
      market: quote.market,
      currency: quote.currency,
      subtotal_minor: quote.subtotal_minor,
      platform_fee_minor: quote.platform_fee_minor,
      processing_fee_minor: quote.processing_fee_minor,
      tax_minor: quote.tax_minor,
      discount_minor: quote.discount_minor,
      total_minor: quote.total_minor,
      fee_rule_version: quote.fee_rule_version,
      fee_percentage_bps: quote.fee_percentage_bps,
      tax_rule_version: quote.tax_rule_version,
      quote_id: quote.id,
      quote_snapshot: JSON.stringify(quote),
      provider: route.provider,
      status: 'CREATED',
      idempotency_key: idempotencyKey,
    });
    await svc.entities.PaymentQuote.update(quote.id, { status: 'CONSUMED', consumed_by_payment_id: payment.id });

    // ── Provider order creation.
    let checkout;
    if (route.provider === 'razorpay') {
      const order = await createOrder(
        { keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret },
        {
          amountMinor: quote.total_minor,
          currency: quote.currency,
          receipt: reference,
          notes: { reference, contest_id: quote.contest_id },
        }
      );
      await svc.entities.Payment.update(payment.id, { status: 'PENDING', provider_order_id: order.id });
      checkout = {
        provider: 'razorpay',
        key_id: creds.razorpayKeyId,
        order_id: order.id,
        amount_minor: quote.total_minor,
        currency: quote.currency,
      };
    } else {
      const session = await createCheckoutSession(
        { secretKey: creds.stripeSecretKey },
        {
          amountMinor: quote.total_minor,
          currency: quote.currency,
          reference,
          contestId: quote.contest_id,
          successUrl: `${origin}/contest/${quote.contest_id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/contest/${quote.contest_id}?payment=cancelled`,
        }
      );
      await svc.entities.Payment.update(payment.id, { status: 'PENDING', provider_order_id: session.id });
      checkout = {
        provider: 'stripe',
        redirect_url: session.url,
        session_id: session.id,
      };
    }

    return Response.json({ payment_id: payment.id, reference, ...checkout });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}