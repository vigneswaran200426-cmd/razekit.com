// @ts-nocheck
// Currency policy engine — ported verbatim from base44/shared/money/markets.ts.
// Currency policy per market. Payment-provider pointers were removed with the
// gateways; only currency/region/label/symbol remain (used for display + the
// fee/quote domain). Funding and payouts are handled off-platform.
export const MARKETS = {
  IN: {
    key: 'IN',
    label: 'India',
    currency: 'INR',
    symbol: '₹',
  },
  GLOBAL: {
    key: 'GLOBAL',
    label: 'International',
    currency: 'USD',
    symbol: '$',
  },
};

export function marketForRegion(region) {
  return region === 'GLOBAL' ? MARKETS.GLOBAL : MARKETS.IN;
}

export function marketForContest(contest) {
  return marketForRegion(contest && contest.settlement_region);
}

export function contestCurrency(contest) {
  return (contest && contest.currency) || marketForContest(contest).currency;
}

export function validateCurrencyForMarket(marketKey, currency) {
  const market = MARKETS[marketKey];
  if (!market) {
    return { ok: false, code: 'UNKNOWN_MARKET', message: `Unknown market: ${marketKey}` };
  }
  if (market.currency !== currency) {
    return {
      ok: false,
      code: 'CURRENCY_MARKET_MISMATCH',
      message: `${currency} is not the settlement currency for ${market.label} (${market.currency}).`,
    };
  }
  return { ok: true, market };
}
