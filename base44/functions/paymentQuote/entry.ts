// POST /payments/quote — the ONLY calculator of what a brand pays.
// Deterministic: same contest, same active MoneyRules → same result, always
// server-side. The frontend never supplies or alters fee/tax/total values.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { marketForContest, contestCurrency, validateCurrencyForMarket } from '../../shared/money/markets.ts';
import { toMinor, makeRef } from '../../shared/money/core.ts';
import { computeQuote, activeRule } from '../../shared/money/fees.ts';

const QUOTE_TTL_MINUTES = 15;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const contestId = body.contest_id;
    if (!contestId) return Response.json({ error: 'contest_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const contest = await svc.entities.Contest.get(contestId);
    if (contest.created_by_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const market = marketForContest(contest);
    const currency = contestCurrency(contest);
    const valid = validateCurrencyForMarket(market.key, currency);
    if (!valid.ok) return Response.json({ error: valid }, { status: 400 });

    // Currency lock: an already-funded contest's financial terms never re-quote.
    const captured = await svc.entities.Payment.filter({ contest_id: contestId, status: 'CAPTURED' }, '-created_date', 1);
    if (captured.length) {
      return Response.json({
        error: { code: 'ALREADY_FUNDED', message: 'This contest is already funded — its financial terms are locked.' },
      }, { status: 409 });
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
      reference,
      contest_id: contestId,
      brand_id: user.id,
      market: market.key,
      currency,
      subtotal_minor: quote.subtotalMinor,
      platform_fee_minor: quote.platformFeeMinor,
      processing_fee_minor: quote.processingFeeMinor,
      tax_minor: quote.taxMinor,
      discount_minor: quote.discountMinor,
      total_minor: quote.totalMinor,
      fee_rule_version: quote.feeRuleVersion,
      fee_percentage_bps: quote.feePercentageBps,
      tax_rule_version: quote.taxRuleVersion,
      status: 'ACTIVE',
      expires_at: expiresAt,
    });

    return Response.json({
      quote_id: record.id,
      reference,
      contest_id: contestId,
      market: { key: market.key, label: market.label },
      ...quote,
      expires_at: expiresAt,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}