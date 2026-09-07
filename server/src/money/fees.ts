// @ts-nocheck
// MoneyCalculationService — ported verbatim from base44/shared/money/fees.ts.
import { feeFromBps } from './core.js';

export function applyFeeRule(rule, baseMinor) {
  if (!rule || !rule.active) return 0;
  if (rule.fee_model === 'NO_FEE') return 0;
  const pct = feeFromBps(baseMinor, rule.percentage_bps || 0);
  switch (rule.fee_model) {
    case 'FIXED_FEE':
      return rule.fixed_fee_minor || 0;
    case 'PERCENTAGE_WITH_MINIMUM':
      return Math.max(pct, rule.minimum_fee_minor || 0);
    case 'PERCENTAGE_WITH_MAXIMUM':
      return rule.maximum_fee_minor == null ? pct : Math.min(pct, rule.maximum_fee_minor);
    default:
      return pct;
  }
}

export function computeQuote({ subtotalMinor, currency, platformRule, processingRule, taxRule, discountMinor }) {
  const subtotal = Math.round(subtotalMinor);
  const platformFeeMinor = applyFeeRule(platformRule, subtotal);
  const processingFeeMinor = applyFeeRule(processingRule, subtotal);
  const taxMinor = applyFeeRule(taxRule, platformFeeMinor + processingFeeMinor);
  const gross = subtotal + platformFeeMinor + processingFeeMinor + taxMinor;
  const discount = Math.max(0, Math.min(discountMinor || 0, gross));
  return {
    subtotalMinor: subtotal,
    platformFeeMinor,
    processingFeeMinor,
    taxMinor,
    discountMinor: discount,
    totalMinor: gross - discount,
    currency,
    feeRuleVersion: (platformRule && platformRule.version) || 'v0',
    feePercentageBps: (platformRule && platformRule.percentage_bps) || 0,
    taxRuleVersion: (taxRule && taxRule.version) || 'v0',
  };
}

export function activeRule(rules, ruleType, marketKey, currency) {
  const matches = (rules || []).filter(
    (r) => r.rule_type === ruleType && r.market === marketKey && r.currency === currency && r.active
  );
  matches.sort((a, b) => String(b.version || '').localeCompare(String(a.version || '')));
  return matches[0] || null;
}
