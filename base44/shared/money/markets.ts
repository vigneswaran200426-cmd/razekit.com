// Currency policy engine — markets are configuration, never scattered if/else.
// Launch: IN → INR (Razorpay / Razorpay Route), GLOBAL → USD (Stripe / Stripe
// Connect where eligible). Adding a market (UK/GBP, EU/EUR, …) is a config
// entry plus provider capability wiring — no engine rebuild.

export const MARKETS = {
  IN: {
    key: 'IN',
    label: 'India',
    currency: 'INR',
    symbol: '₹',
    paymentProvider: 'razorpay',
    payoutProvider: 'razorpay_route',
  },
  GLOBAL: {
    key: 'GLOBAL',
    label: 'International',
    currency: 'USD',
    symbol: '$',
    paymentProvider: 'stripe',
    payoutProvider: 'stripe_connect',
  },
};

// Contest market is decided by the contest's settlement region — chosen by the
// brand at creation and locked at funding. Never derived from locale/IP/timezone.
// The documented settlement_region default is 'IN' (India launch), and legacy
// contests created before the field existed settle in India — only an explicit
// GLOBAL region selects the international market.
export function marketForRegion(region) {
  return region === 'GLOBAL' ? MARKETS.GLOBAL : MARKETS.IN;
}

export function marketForContest(contest) {
  return marketForRegion(contest && contest.settlement_region);
}

// Contest currency — locked on the contest once funded; policy fallback before that.
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