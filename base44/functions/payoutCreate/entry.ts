// POST /payouts/create — initiates the winner payout for a contest.
// Admin-triggered (Razekit operations) — creators can never self-pay.
// Eligibility is strict: captured funding payment + selected winner + verified
// creator payout account + provider capability. The payout only completes via
// the provider webhook — an API response is never treated as completion.
// Idempotent per contest: a second trigger returns the existing payout.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { marketForContest, contestCurrency, validateCurrencyForMarket } from '../../shared/money/markets.ts';
import { makeRef } from '../../shared/money/core.ts';
import { readCreds, routePayout } from '../../shared/money/router.ts';
import { createTransfer as razorpayTransfer } from '../../shared/money/providers/razorpay.ts';
import { createTransfer as stripeTransfer } from '../../shared/money/providers/stripe.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const contestId = body.contest_id;
    if (!contestId) return Response.json({ error: 'contest_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const contest = await svc.entities.Contest.get(contestId);
    if (!contest.winner_user_id || !contest.winner_submission_id) {
      return Response.json({ error: { code: 'NOT_PAYABLE', message: 'No winner has been selected for this contest yet.' } }, { status: 409 });
    }

    // Idempotency: at most one active payout per contest.
    const existing = await svc.entities.Payout.filter({ contest_id: contestId }, '-created_date', 5);
    const active = existing.find((p) => ['PAYOUT_INITIATED', 'PAYOUT_PROCESSING', 'PAYOUT_COMPLETED'].includes(p.status));
    if (active) return Response.json({ payout: active, idempotent: true });

    // Winner must be payable: a captured funding payment must exist.
    const payments = await svc.entities.Payment.filter({ contest_id: contestId, status: 'CAPTURED' }, '-created_date', 1);
    if (!payments.length) {
      return Response.json({ error: { code: 'NOT_PAYABLE', message: 'This contest has no captured funding payment.' } }, { status: 409 });
    }
    const payment = payments[0];

    const market = marketForContest(contest);
    const currency = contestCurrency(contest);
    const valid = validateCurrencyForMarket(market.key, currency);
    if (!valid.ok) return Response.json({ error: valid }, { status: 400 });

    const creds = readCreds(secrets);
    const route = routePayout(market, currency, creds);
    if (!route.ok) return Response.json({ error: route }, { status: 503 });

    const reference = makeRef('RK-PAYOUT');
    const base = {
      reference,
      creator_id: contest.winner_user_id,
      brand_id: contest.created_by_id,
      contest_id: contestId,
      payment_id: payment.id,
      market: market.key,
      currency,
      amount_minor: payment.subtotal_minor,
      provider: route.provider,
      idempotency_key: `payout-${contestId}`,
    };

    // Creator's verified provider account — the winner receives the full
    // advertised prize in the contest currency; no silent conversion.
    const accounts = await svc.entities.PayoutAccount.filter({ user_id: contest.winner_user_id, provider: route.provider });
    const account = accounts.find((a) => a.payouts_enabled && a.onboarding_status === 'verified');
    if (!account) {
      const payout = await svc.entities.Payout.create({
        ...base,
        status: 'ON_HOLD',
        failure_reason: 'Creator payout account is not onboarded/verified with the provider yet.',
      });
      await svc.entities.Notification.create({
        type: 'payment_received',
        title: 'Payout action required',
        description: `Your winner payout needs a verified payout account. Set up payouts to receive your prize.`,
        recipient_user_id: contest.winner_user_id,
        contest_id: contestId,
      }).catch(() => null);
      return Response.json({
        payout,
        error: { code: 'PAYOUT_ON_HOLD', message: 'Winner has no verified payout account — onboarding required before the payout can run.' },
      });
    }

    // Record READY_FOR_PAYOUT before the external call, then transfer.
    let payout = await svc.entities.Payout.create({
      ...base,
      provider_account_id: account.provider_account_id,
      status: 'READY_FOR_PAYOUT',
    });
    try {
      let transfer;
      if (route.provider === 'razorpay') {
        transfer = await razorpayTransfer(
          { keyId: creds.razorpayKeyId, keySecret: creds.razorpayKeySecret },
          { amountMinor: payout.amount_minor, currency, linkedAccountId: account.provider_account_id, notes: { reference, contest_id: contestId } }
        );
      } else {
        transfer = await stripeTransfer(
          { secretKey: creds.stripeSecretKey },
          { amountMinor: payout.amount_minor, currency, connectedAccountId: account.provider_account_id, idempotencyKey: reference }
        );
      }
      payout = await svc.entities.Payout.update(payout.id, {
        status: 'PAYOUT_INITIATED',
        provider_transfer_id: transfer.id,
        initiated_at: new Date().toISOString(),
      });
    } catch (e) {
      payout = await svc.entities.Payout.update(payout.id, {
        status: 'PAYOUT_FAILED',
        failure_reason: String(e.message).slice(0, 300),
      });
      return Response.json({ payout, error: { code: 'PAYOUT_FAILED', message: 'The provider rejected the transfer — recorded for review.' } }, { status: 502 });
    }

    return Response.json({ payout });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}