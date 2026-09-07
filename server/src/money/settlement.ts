// @ts-nocheck
// SettlementService — ported verbatim from base44/shared/money/settlement.ts.
import { appendLedger } from './ledger.js';
import { toMajor } from './core.js';

export async function settleCapturedPayment(sdk, { payment, contest }) {
  if (payment.status === 'CAPTURED') {
    return { alreadySettled: true, payment };
  }
  if (payment.status === 'REFUNDED' || payment.status === 'RECONCILIATION_REQUIRED') {
    throw new Error(`SETTLE_BLOCKED:${payment.status}`);
  }
  const currency = payment.currency;
  await appendLedger(sdk, {
    userId: payment.brand_id,
    currency,
    contestId: payment.contest_id,
    paymentId: payment.id,
    entries: [
      { entryType: 'DEPOSIT', direction: 'CREDIT', amountMinor: payment.total_minor, description: 'Contest funding payment received' },
      { entryType: 'PLATFORM_FEE', direction: 'DEBIT', amountMinor: payment.platform_fee_minor, description: 'Razekit platform fee' },
      { entryType: 'PROCESSING_FEE', direction: 'DEBIT', amountMinor: payment.processing_fee_minor, description: 'Payment processing fee' },
      { entryType: 'TAX', direction: 'DEBIT', amountMinor: payment.tax_minor, description: 'Tax on platform charges' },
      { entryType: 'PRIZE_RESERVATION', direction: 'DEBIT', amountMinor: payment.subtotal_minor, description: 'Prize reserved for the contest winner' },
    ],
  });
  const updatedPayment = await sdk.entities.Payment.update(payment.id, {
    status: 'CAPTURED',
    captured_at: new Date().toISOString(),
  });
  const contestUpdate = {
    currency,
    platform_fee: toMajor(payment.platform_fee_minor, currency),
    status: contest.status === 'draft' ? 'open' : contest.status,
  };
  const updatedContest = await sdk.entities.Contest.update(contest.id, contestUpdate).catch(() => null);
  await sdk.entities.Notification.create({
    type: 'payment_received',
    title: 'Contest funded',
    description: `Prize funding confirmed (${payment.reference}). Your contest is live.`,
    recipient_user_id: payment.brand_id,
    contest_id: payment.contest_id,
  }).catch(() => null);
  return { payment: updatedPayment, contest: updatedContest };
}

export async function completePayout(sdk, { payout }) {
  if (payout.status === 'PAYOUT_COMPLETED') {
    return { alreadyCompleted: true, payout };
  }
  await appendLedger(sdk, {
    userId: payout.creator_id,
    currency: payout.currency,
    contestId: payout.contest_id,
    payoutId: payout.id,
    entries: [
      { entryType: 'PAYOUT_CREDIT', direction: 'CREDIT', amountMinor: payout.amount_minor, description: 'Winner payout received' },
    ],
  });
  const updated = await sdk.entities.Payout.update(payout.id, {
    status: 'PAYOUT_COMPLETED',
    completed_at: new Date().toISOString(),
  });
  await sdk.entities.Notification.create({
    type: 'payment_received',
    title: 'Payout completed',
    description: `Your winner payout (${payout.reference}) has completed.`,
    recipient_user_id: payout.creator_id,
    contest_id: payout.contest_id,
  }).catch(() => null);
  return { payout: updated };
}

export async function refundCapturedPayment(sdk, { payment, contest }) {
  if (payment.status === 'REFUNDED') {
    return { alreadyRefunded: true, payment };
  }
  if (contest && contest.winner_user_id) {
    return { blocked: true, reason: 'WINNER_SELECTED' };
  }
  const currency = payment.currency;
  await appendLedger(sdk, {
    userId: payment.brand_id,
    currency,
    contestId: payment.contest_id,
    paymentId: payment.id,
    entries: [
      { entryType: 'FEE_REFUND', direction: 'CREDIT', amountMinor: payment.platform_fee_minor + payment.processing_fee_minor + payment.tax_minor, description: 'Fee refund on cancelled contest' },
      { entryType: 'PRIZE_REFUND', direction: 'CREDIT', amountMinor: payment.subtotal_minor, description: 'Prize refund on cancelled contest' },
    ],
  });
  const updated = await sdk.entities.Payment.update(payment.id, {
    status: 'REFUNDED',
    refunded_at: new Date().toISOString(),
  });
  await sdk.entities.Notification.create({
    type: 'payment_received',
    title: 'Refund processed',
    description: `Your contest funding (${payment.reference}) has been refunded to your wallet.`,
    recipient_user_id: payment.brand_id,
    contest_id: payment.contest_id,
  }).catch(() => null);
  return { payment: updated };
}
