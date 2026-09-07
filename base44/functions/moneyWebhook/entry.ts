// POST /webhooks/money?provider=razorpay|stripe — the mandatory webhook surface.
// Every provider event is signature-verified, deduplicated by event id, and
// applied idempotently. Financial state NEVER moves on frontend callbacks —
// this endpoint (and provider state queries) are the only truth sources.
//
// Webhook URLs (register in the provider dashboards):
//   Razorpay: <app>/functions/moneyWebhook?provider=razorpay
//   Stripe:   <app>/functions/moneyWebhook?provider=stripe

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { readCreds } from '../../shared/money/router.ts';
import { verifyWebhookSignature as verifyRazorpayWebhook } from '../../shared/money/providers/razorpay.ts';
import { verifyWebhookSignature as verifyStripeWebhook } from '../../shared/money/providers/stripe.ts';
import { sha256Hex } from '../../shared/money/providers/crypto.ts';
import { settleCapturedPayment, completePayout, refundCapturedPayment } from '../../shared/money/settlement.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const raw = await req.text();
    const provider = new URL(req.url).searchParams.get('provider');
    const creds = readCreds(secrets);

    let valid = false;
    let eventType = null;
    let eventId = null;
    let entity = null;

    if (provider === 'razorpay') {
      valid = await verifyRazorpayWebhook(creds.razorpayWebhookSecret, raw, req.headers.get('x-razorpay-signature'));
      if (valid) {
        const event = JSON.parse(raw);
        eventType = event.event;
        entity =
          (event.payload && event.payload.payment && event.payload.payment.entity) ||
          (event.payload && event.payload.transfer && event.payload.transfer.entity) ||
          (event.payload && event.payload.refund && event.payload.refund.entity) ||
          null;
        // Razorpay has no event id — a content hash dedupes exact redeliveries.
        eventId = await sha256Hex(raw);
      }
    } else if (provider === 'stripe') {
      valid = await verifyStripeWebhook(creds.stripeWebhookSecret, raw, req.headers.get('stripe-signature'));
      if (valid) {
        const event = JSON.parse(raw);
        eventType = event.type;
        eventId = event.id;
        entity = (event.data && event.data.object) || null;
      }
    } else {
      return Response.json({ error: 'Unknown provider' }, { status: 400 });
    }

    if (!valid) {
      await svc.entities.ProviderWebhookEvent.create({
        provider: provider || 'unknown',
        event_id: 'invalid-signature',
        event_type: eventType,
        signature_valid: false,
        status: 'REJECTED',
        summary: '{}',
      }).catch(() => null);
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── Deduplication: the same event is processed exactly once.
    const dupe = await svc.entities.ProviderWebhookEvent.filter({ event_id: eventId }, '-created_date', 1);
    if (dupe.length) return Response.json({ received: true, duplicate: true });

    const whRecord = await svc.entities.ProviderWebhookEvent.create({
      provider,
      event_id: eventId,
      event_type: eventType,
      signature_valid: true,
      status: 'RECEIVED',
      summary: '{}',
    });

    let result = { status: 'IGNORED' };
    let relatedRef = null;

    if (provider === 'razorpay') {
      if (eventType === 'payment.captured' && entity && entity.order_id) {
        const payments = await svc.entities.Payment.filter({ provider_order_id: entity.order_id }, '-created_date', 1);
        if (payments.length) {
          relatedRef = payments[0].reference;
          await svc.entities.Payment.update(payments[0].id, { provider_payment_id: entity.id });
          const fresh = await svc.entities.Payment.get(payments[0].id);
          const contest = await svc.entities.Contest.get(payments[0].contest_id);
          result = await settleCapturedPayment(svc, { payment: fresh, contest });
        }
      } else if (eventType === 'payment.failed' && entity && entity.order_id) {
        const payments = await svc.entities.Payment.filter({ provider_order_id: entity.order_id }, '-created_date', 1);
        if (payments.length && !['CAPTURED', 'REFUNDED'].includes(payments[0].status)) {
          relatedRef = payments[0].reference;
          result = await svc.entities.Payment.update(payments[0].id, {
            status: 'FAILED',
            failure_reason: (entity.error_description || entity.error_code || 'Payment failed at the provider'),
          });
        }
      } else if (eventType === 'refund.processed' && entity) {
        const payments = await svc.entities.Payment.filter({ provider_payment_id: entity.payment_id }, '-created_date', 1);
        if (payments.length) {
          relatedRef = payments[0].reference;
          const fresh = await svc.entities.Payment.get(payments[0].id);
          const contest = await svc.entities.Contest.get(payments[0].contest_id);
          result = await refundCapturedPayment(svc, { payment: fresh, contest });
        }
      } else if ((eventType === 'transfer.processed' || eventType === 'transfer.settled') && entity && entity.id) {
        const payouts = await svc.entities.Payout.filter({ provider_transfer_id: entity.id }, '-created_date', 1);
        if (payouts.length) {
          relatedRef = payouts[0].reference;
          const fresh = await svc.entities.Payout.get(payouts[0].id);
          result = await completePayout(svc, { payout: fresh });
        }
      }
    } else if (provider === 'stripe') {
      if (eventType === 'checkout.session.completed' && entity && entity.id) {
        const payments = await svc.entities.Payment.filter({ provider_order_id: entity.id }, '-created_date', 1);
        if (payments.length) {
          relatedRef = payments[0].reference;
          await svc.entities.Payment.update(payments[0].id, { provider_payment_id: entity.payment_intent });
          const fresh = await svc.entities.Payment.get(payments[0].id);
          const contest = await svc.entities.Contest.get(payments[0].contest_id);
          result = await settleCapturedPayment(svc, { payment: fresh, contest });
        }
      } else if (eventType === 'checkout.session.expired' && entity && entity.id) {
        const payments = await svc.entities.Payment.filter({ provider_order_id: entity.id }, '-created_date', 1);
        if (payments.length && payments[0].status === 'PENDING') {
          relatedRef = payments[0].reference;
          result = await svc.entities.Payment.update(payments[0].id, { status: 'CANCELLED', failure_reason: 'Checkout session expired' });
        }
      } else if (eventType === 'charge.refunded' && entity && entity.payment_intent) {
        const payments = await svc.entities.Payment.filter({ provider_payment_id: entity.payment_intent }, '-created_date', 1);
        if (payments.length) {
          relatedRef = payments[0].reference;
          const fresh = await svc.entities.Payment.get(payments[0].id);
          const contest = await svc.entities.Contest.get(payments[0].contest_id);
          result = await refundCapturedPayment(svc, { payment: fresh, contest });
        }
      } else if (eventType === 'transfer.created' && entity && entity.id) {
        // Platform → connected account transfer confirmed: funds moved.
        const payouts = await svc.entities.Payout.filter({ provider_transfer_id: entity.id }, '-created_date', 1);
        if (payouts.length) {
          relatedRef = payouts[0].reference;
          const fresh = await svc.entities.Payout.get(payouts[0].id);
          result = await completePayout(svc, { payout: fresh });
        }
      }
    }

    await svc.entities.ProviderWebhookEvent.update(whRecord.id, {
      status: 'PROCESSED',
      related_ref: relatedRef,
      summary: JSON.stringify({ event_type: eventType, result_status: (result && (result.status || result.alreadySettled && 'ALREADY_SETTLED' || result.alreadyCompleted && 'ALREADY_COMPLETED')) || 'OK' }),
    }).catch(() => null);

    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}