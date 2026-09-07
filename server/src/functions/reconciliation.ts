// @ts-nocheck
// Ported from base44/functions/moneyReconciliation. Runs from cron (no user) or
// manually by an admin.
import { secrets } from '../secrets.js';
import { json } from './context.js';
import { makeRef } from '../money/core.js';
import { readCreds } from '../money/router.js';
import { fetchOrder, fetchOrderPayments, fetchTransfer as fetchRazorpayTransfer } from '../money/providers/razorpay.js';
import { fetchSession, fetchTransfer as fetchStripeTransfer } from '../money/providers/stripe.js';
import { settleCapturedPayment, completePayout } from '../money/settlement.js';
import { serviceClient } from '../entities/service.js';

const STALE_PAYMENT_MS = 30 * 60 * 1000;
const STALE_PAYOUT_MS = 60 * 60 * 1000;

export async function moneyReconciliation(ctx) {
  const user = ctx?.user || null;
  if (user && user.role !== 'admin') return json({ error: 'Forbidden' }, 403);

  const svc = ctx?.svc || serviceClient();
  const creds = readCreds(secrets);
  const summary = { payments_checked: 0, payments_updated: 0, payouts_checked: 0, payouts_updated: 0, reconciliation_records: 0 };

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
          const captured = (orderPayments.items || orderPayments || []).find?.((p) => p.status === 'captured');
          await svc.entities.Payment.update(payment.id, { provider_payment_id: (captured && captured.id) || null });
          const fresh = await svc.entities.Payment.get(payment.id);
          const contest = await svc.entities.Contest.get(payment.contest_id);
          await settleCapturedPayment(svc, { payment: fresh, contest });
          summary.payments_updated++;
        } else if (order.status === 'failed') {
          await svc.entities.Payment.update(payment.id, { status: 'FAILED', failure_reason: 'Provider reports failed payment' });
          summary.payments_updated++;
        }
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
        reference: makeRef('RK-RECON'), entity_type: 'PAYMENT', internal_ref: payment.reference,
        internal_status: payment.status, provider: payment.provider, provider_ref: payment.provider_order_id,
        mismatch_summary: `Provider state could not be verified: ${String(e.message).slice(0, 200)}`, status: 'OPEN',
      });
      await svc.entities.Payment.update(payment.id, { status: 'RECONCILIATION_REQUIRED' }).catch(() => null);
      summary.reconciliation_records++;
    }
  }

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
        reference: makeRef('RK-RECON'), entity_type: 'PAYOUT', internal_ref: payout.reference,
        internal_status: payout.status, provider: payout.provider, provider_ref: payout.provider_transfer_id,
        mismatch_summary: `Provider transfer state could not be verified: ${String(e.message).slice(0, 200)}`, status: 'OPEN',
      });
      summary.reconciliation_records++;
    }
  }

  return json(summary);
}
