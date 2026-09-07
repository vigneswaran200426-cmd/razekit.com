// POST /money/reconciliation — periodic sweep that converges internal money
// state to provider truth. Stale pending payments/payouts are checked against
// the provider; anything unresolvable becomes RECONCILIATION_REQUIRED plus a
// ReconciliationRecord instead of silently staying in a wrong state.
// Runs from the hourly Money Reconciliation workflow (no user session), or
// manually by an admin.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { makeRef } from '../../shared/money/core.ts';
import { readCreds } from '../../shared/money/router.ts';
import { fetchOrder, fetchOrderPayments, fetchTransfer as fetchRazorpayTransfer } from '../../shared/money/providers/razorpay.ts';
import { fetchSession, fetchTransfer as fetchStripeTransfer } from '../../shared/money/providers/stripe.ts';
import { settleCapturedPayment, completePayout } from '../../shared/money/settlement.ts';

const STALE_PAYMENT_MS = 30 * 60 * 1000; // 30 minutes
const STALE_PAYOUT_MS = 60 * 60 * 1000; // 1 hour

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Workflow invocations carry no user session; a direct human call must be admin.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;
    const creds = readCreds(secrets);
    const summary = { payments_checked: 0, payments_updated: 0, payouts_checked: 0, payouts_updated: 0, reconciliation_records: 0 };

    // ── Stale pending payments → authoritative provider state.
    const pendingPayments = await svc.entities.Payment.filter({ status: 'PENDING' }, 'created_date', 100);
    for (const payment of pendingPayments) {
      if (Date.now() - new Date(payment.created_date).getTime() < STALE_PAYMENT_MS) continue;
      summary.payments_checked++;
      try {
        if (payment.provider === 'razorpay') {
          if (!creds.razorpayKeyId || !creds.razorpayKeySecret) continue;
          const order = await fetchOrder({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, payment.provider_order_id);
          if (order.status === 'paid' || order.status === 'captured') {
            const orderPayments = await fetchOrderPayments({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, order.id);
            const captured = (orderPayments || []).find((p) => p.status === 'captured');
            await svc.entities.Payment.update(payment.id, { provider_payment_id: (captured && captured.id) || null });
            const fresh = await svc.entities.Payment.get(payment.id);
            const contest = await svc.entities.Contest.get(payment.contest_id);
            await settleCapturedPayment(svc, { payment: fresh, contest });
            summary.payments_updated++;
          } else if (order.status === 'failed') {
            await svc.entities.Payment.update(payment.id, { status: 'FAILED', failure_reason: 'Provider reports failed payment' });
            summary.payments_updated++;
          }
          // created/attempted/authorized → still pending at the provider; leave.
        } else {
          if (!creds.stripeSecretKey) continue;
          const session = await fetchSession({ secretKey: creds.stripeSecretKey }, payment.provider_order_id);
          if (session.payment_status === 'paid') {
            await svc.entities.Payment.update(payment.id, { provider_payment_id: session.payment_intent });
            const fresh = await svc.entities.Payment.get(payment.id);
            const contest = await svc.entities.Contest.get(payment.contest_id);
            await settleCapturedPayment(svc, { payment: fresh, contest });
            summary.payments_updated++;
          } else if (session.status === 'expired') {
            await svc.entities.Payment.update(payment.id, { status: 'CANCELLED', failure_reason: 'Checkout session expired' });
            summary.payments_updated++;
          }
        }
      } catch (e) {
        await svc.entities.ReconciliationRecord.create({
          reference: makeRef('RK-RECON'),
          entity_type: 'PAYMENT',
          internal_ref: payment.reference,
          internal_status: payment.status,
          provider: payment.provider,
          provider_ref: payment.provider_order_id,
          mismatch_summary: `Provider state could not be verified: ${String(e.message).slice(0, 200)}`,
          status: 'OPEN',
        });
        await svc.entities.Payment.update(payment.id, { status: 'RECONCILIATION_REQUIRED' }).catch(() => null);
        summary.reconciliation_records++;
      }
    }

    // ── Stale initiated payouts → authoritative transfer state.
    const initiatedPayouts = await svc.entities.Payout.filter({ status: 'PAYOUT_INITIATED' }, 'created_date', 100);
    for (const payout of initiatedPayouts) {
      if (Date.now() - new Date(payout.created_date).getTime() < STALE_PAYOUT_MS) continue;
      if (!payout.provider_transfer_id) continue;
      summary.payouts_checked++;
      try {
        let providerStatus = null;
        if (payout.provider === 'razorpay') {
          if (!creds.razorpayKeyId || !creds.razorpayKeySecret) continue;
          const transfer = await fetchRazorpayTransfer({ keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret }, payout.provider_transfer_id);
          providerStatus = transfer.status;
          if (providerStatus === 'processed' || providerStatus === 'settled') {
            const fresh = await svc.entities.Payout.get(payout.id);
            await completePayout(svc, { payout: fresh });
            summary.payouts_updated++;
          } else if (providerStatus === 'reversed') {
            await svc.entities.Payout.update(payout.id, { status: 'PAYOUT_REVERSED', failure_reason: 'Provider reports the transfer was reversed' });
            summary.payouts_updated++;
          }
        } else {
          if (!creds.stripeSecretKey) continue;
          const transfer = await fetchStripeTransfer({ secretKey: creds.stripeSecretKey }, payout.provider_transfer_id);
          providerStatus = transfer.status;
          if (providerStatus === 'paid') {
            const fresh = await svc.entities.Payout.get(payout.id);
            await completePayout(svc, { payout: fresh });
            summary.payouts_updated++;
          } else if (transfer.status === 'failed') {
            await svc.entities.Payout.update(payout.id, { status: 'PAYOUT_FAILED', failure_reason: 'Provider reports the transfer failed' });
            summary.payouts_updated++;
          }
        }
      } catch (e) {
        await svc.entities.ReconciliationRecord.create({
          reference: makeRef('RK-RECON'),
          entity_type: 'PAYOUT',
          internal_ref: payout.reference,
          internal_status: payout.status,
          provider: payout.provider,
          provider_ref: payout.provider_transfer_id,
          mismatch_summary: `Provider transfer state could not be verified: ${String(e.message).slice(0, 200)}`,
          status: 'OPEN',
        });
        summary.reconciliation_records++;
      }
    }

    return Response.json(summary);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}