// @ts-nocheck
// Ported from base44/functions/moneyWebhook. Needs the RAW request body for
// signature verification. Register these URLs in the provider dashboards:
//   Razorpay: <API_BASE_URL>/api/webhooks/money?provider=razorpay
//   Stripe:   <API_BASE_URL>/api/webhooks/money?provider=stripe
import { secrets } from '../secrets.js';
import { readCreds } from '../money/router.js';
import { verifyWebhookSignature as verifyRazorpayWebhook } from '../money/providers/razorpay.js';
import { verifyWebhookSignature as verifyStripeWebhook } from '../money/providers/stripe.js';
import { verifyWebhookSignature as verifyPaypalWebhook } from '../money/providers/paypal.js';
import { sha256Hex } from '../money/providers/crypto.js';
import { settleCapturedPayment, completePayout, refundCapturedPayment } from '../money/settlement.js';
import { serviceClient } from '../entities/service.js';

export async function handleMoneyWebhook({ rawBody, provider, headers }) {
  const svc = serviceClient();
  const raw = rawBody;
  const creds = readCreds(secrets);

  let valid = false, eventType = null, eventId = null, entity = null;

  if (provider === 'razorpay') {
    valid = await verifyRazorpayWebhook(creds.razorpayWebhookSecret, raw, headers['x-razorpay-signature']);
    if (valid) {
      const event = JSON.parse(raw);
      eventType = event.event;
      entity =
        (event.payload && event.payload.payment && event.payload.payment.entity) ||
        (event.payload && event.payload.transfer && event.payload.transfer.entity) ||
        (event.payload && event.payload.refund && event.payload.refund.entity) || null;
      eventId = await sha256Hex(raw);
    }
  } else if (provider === 'stripe') {
    valid = await verifyStripeWebhook(creds.stripeWebhookSecret, raw, headers['stripe-signature']);
    if (valid) {
      const event = JSON.parse(raw);
      eventType = event.type;
      eventId = event.id;
      entity = (event.data && event.data.object) || null;
    }
  } else if (provider === 'paypal') {
    valid = await verifyPaypalWebhook(
      { clientId: creds.paypalClientId, clientSecret: creds.paypalClientSecret, env: creds.paypalEnv },
      { headers, rawBody: raw, webhookId: creds.paypalWebhookId }
    );
    if (valid) {
      const event = JSON.parse(raw);
      eventType = event.event_type;
      eventId = event.id;
      entity = event.resource || null;
    }
  } else {
    return { status: 400, json: { error: 'Unknown provider' } };
  }

  if (!valid) {
    await svc.entities.ProviderWebhookEvent.create({
      provider: provider || 'unknown', event_id: 'invalid-signature', event_type: eventType,
      signature_valid: false, status: 'REJECTED', summary: '{}',
    }).catch(() => null);
    return { status: 401, json: { error: 'Invalid signature' } };
  }

  const dupe = await svc.entities.ProviderWebhookEvent.filter({ event_id: eventId }, '-created_date', 1);
  if (dupe.length) return { status: 200, json: { received: true, duplicate: true } };

  const whRecord = await svc.entities.ProviderWebhookEvent.create({
    provider, event_id: eventId, event_type: eventType, signature_valid: true, status: 'RECEIVED', summary: '{}',
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
        result = await svc.entities.Payment.update(payments[0].id, { status: 'FAILED', failure_reason: (entity.error_description || entity.error_code || 'Payment failed at the provider') });
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
      const payouts = await svc.entities.Payout.filter({ provider_transfer_id: entity.id }, '-created_date', 1);
      if (payouts.length) {
        relatedRef = payouts[0].reference;
        const fresh = await svc.entities.Payout.get(payouts[0].id);
        result = await completePayout(svc, { payout: fresh });
      }
    }
  } else if (provider === 'paypal') {
    // Capture already happens synchronously on the payer's return; these events
    // are a backup path + refund/denial handling.
    const orderId =
      (entity && entity.supplementary_data && entity.supplementary_data.related_ids && entity.supplementary_data.related_ids.order_id) ||
      (entity && entity.custom_id) || null;
    const byOrder = async () => (orderId ? svc.entities.Payment.filter({ provider_order_id: orderId }, '-created_date', 1) : []);
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && entity) {
      let payments = await byOrder();
      if (!payments.length && entity.custom_id) payments = await svc.entities.Payment.filter({ reference: entity.custom_id }, '-created_date', 1);
      if (payments.length) {
        relatedRef = payments[0].reference;
        await svc.entities.Payment.update(payments[0].id, { provider_payment_id: entity.id });
        const fresh = await svc.entities.Payment.get(payments[0].id);
        const contest = await svc.entities.Contest.get(payments[0].contest_id);
        result = await settleCapturedPayment(svc, { payment: fresh, contest });
      }
    } else if ((eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'PAYMENT.CAPTURE.DECLINED') && entity) {
      const payments = await byOrder();
      if (payments.length && !['CAPTURED', 'REFUNDED'].includes(payments[0].status)) {
        relatedRef = payments[0].reference;
        result = await svc.entities.Payment.update(payments[0].id, { status: 'FAILED', failure_reason: 'PayPal capture denied' });
      }
    } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED' && entity) {
      const payments = await byOrder();
      if (payments.length) {
        relatedRef = payments[0].reference;
        const fresh = await svc.entities.Payment.get(payments[0].id);
        const contest = await svc.entities.Contest.get(payments[0].contest_id);
        result = await refundCapturedPayment(svc, { payment: fresh, contest });
      }
    }
  }

  await svc.entities.ProviderWebhookEvent.update(whRecord.id, {
    status: 'PROCESSED', related_ref: relatedRef,
    summary: JSON.stringify({ event_type: eventType, result_status: (result && (result.status || (result.alreadySettled && 'ALREADY_SETTLED') || (result.alreadyCompleted && 'ALREADY_COMPLETED'))) || 'OK' }),
  }).catch(() => null);

  return { status: 200, json: { received: true } };
}
