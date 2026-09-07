// MoneyCalculationService — deterministic fee/quote computation.
// Given the same inputs the output is always identical, and identical between
// any two calls: the backend is the only calculator; the frontend only renders.

import { feeFromBps } from './core.ts';

// Apply a MoneyRule to a base amount. The fee is calculated ONLY on the base
// passed in — platform fee uses the prize subtotal, tax uses the marketplace's
// own charges. A rule is never applied on top of fees or tax.
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
      // STANDARD_PERCENTAGE / CUSTOM_PERCENTAGE
      return pct;
  }
}

export function computeQuote({ subtotalMinor, currency, platformRule, processingRule, taxRule, discountMinor }) {
  const subtotal = Math.round(subtotalMinor);
  const platformFeeMinor = applyFeeRule(platformRule, subtotal);
  const processingFeeMinor = applyFeeRule(processingRule, subtotal);
  // Tax applies to the marketplace's own charges (platform + processing fees),
  // never to the creator prize. No hard-coded rates — MoneyRule only.
  const taxMinor = applyFeeRule(taxRule, platformFeeMinor + processingFeeMinor);
  const gross = subtotal + platformFeeMinor + processingFeeMinor + taxMinor;
  // A discount can never create a negative payable amount.
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

// Highest active version wins — rule versioning keeps historical charges intact.
export function activeRule(rules, ruleType, marketKey, currency) {
  const matches = (rules || []).filter(
    (r) => r.rule_type === ruleType && r.market === marketKey && r.currency === currency && r.active
  );
  matches.sort((a, b) => String(b.version || '').localeCompare(String(a.version || '')));
  return matches[0] || null;
}