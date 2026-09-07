// POST /payments/confirm — server-side verification of a payment.
// Razorpay: HMAC-SHA256 checkout signature, or an authoritative order state
// query in poll mode. Stripe: authoritative checkout-session retrieval.
// A payment only becomes CAPTURED here or in the webhook — never from a
// browser redirect alone. Idempotent: confirming twice settles once.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { readCreds } from '../../shared/money/router.ts';
import { verifyCheckoutSignature, fetchOrder, fetchOrderPayments } from '../../shared/money/providers/razorpay.ts';
import { fetchSession } from '../../shared/money/providers/stripe.ts';
import { settleCapturedPayment } from '../../shared/money/settlement.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    let payment;
    if (body.payment_id) {
      payment = await svc.entities.Payment.get(body.payment_id);
    } else if (body.reference) {
      const list = await svc.entities.Payment.filter({ reference: body.reference }, '-created_date', 1);
      if (!list.length) return Response.json({ error: 'Payment not found' }, { status: 404 });
      payment = list[0];
    } else {
      return Response.json({ error: 'payment_id or reference is required' }, { status: 400 });
    }
    if (payment.brand_id !== user.id && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (payment.status === 'CAPTURED') {
      return Response.json({ status: 'CAPTURED', reference: payment.reference, captured: true });
    }

    const creds = readCreds(secrets);

    if (payment.provider === 'razorpay') {
      const rz = body.razorpay || {};
      if (rz.order_id && rz.payment_id && rz.signature) {
        // Checkout callback path — verify the signature server-side.
        const valid = await verifyCheckoutSignature(creds.razorpayKeySecret, rz);
        if (!valid) {
          await svc.entities.Payment.update(payment.id, { status: 'FAILED', failure_reason: 'Checkout signature verification failed' });
          return Response.json({ error: { code: 'VERIFICATION_FAILED', message: "Payment couldn't be verified." } }, { status: 400 });
        }
        await svc.entities.Payment.update(payment.id, { provider_payment_id: rz.payment_id, status: 'AUTHORIZED' });
      } else {
        // Poll path — ask Razorpay for the authoritative order state.
        const order = await fetchOrder({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, payment.provider_order_id);
        if (order.status !== 'paid' && order.status !== 'captured') {
          return Response.json({ status: 'PENDING', provider_status: order.status });
        }
        const orderPayments = await fetchOrderPayments({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, order.id);
        const capturedPayment = (orderPayments || []).find((p) => p.status === 'captured');
        await svc.entities.Payment.update(payment.id, {
          provider_payment_id: (capturedPayment && capturedPayment.id) || null,
          status: 'AUTHORIZED',
        });
      }
    } else {
      // Stripe — retrieve the session (authoritative), never trust the redirect.
      const sessionId = (body.stripe && body.stripe.session_id) || payment.provider_order_id;
      const session = await fetchSession({ secretKey: creds.stripeSecretKey }, sessionId);
      if (session.payment_status !== 'paid') {
        return Response.json({ status: 'PENDING', provider_status: session.payment_status });
      }
      await svc.entities.Payment.update(payment.id, {
        provider_payment_id: session.payment_intent,
        status: 'AUTHORIZED',
      });
    }

    // Settle: balanced ledger entries + contest funded/published + notification.
    const fresh = await svc.entities.Payment.get(payment.id);
    const contest = await svc.entities.Contest.get(payment.contest_id);
    await settleCapturedPayment(svc, { payment: fresh, contest });
    return Response.json({ status: 'CAPTURED', reference: payment.reference, captured: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}