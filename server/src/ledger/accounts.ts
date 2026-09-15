// @ts-nocheck
// Chart of accounts.
//
// RazeKit's money is not one number per user. A single rupee moves through
// distinct pots with different meanings, and conflating them is how platforms
// end up paying a creator with another client's prize money. The classes below
// keep those pots separate by construction:
//
//   BANK_SETTLEMENT           what is actually in the bank account (asset)
//   CLIENT_FUNDS              a client's money we hold but have not committed
//   CONTEST_PRIZE_COMMITMENT  money committed to one specific contest
//   PAYOUT_LIABILITY          money owed to one specific creator, drawable
//   WITHDRAWAL_PENDING        owed money earmarked for a withdrawal in flight
//   PLATFORM_FEE              RazeKit's revenue
//   TAX_PAYABLE               tax collected on platform charges
//   REFUND_CLEARING           refunds approved but not yet transferred

export const ACCOUNT_CLASS = {
  BANK_SETTLEMENT: 'BANK_SETTLEMENT',
  CLIENT_FUNDS: 'CLIENT_FUNDS',
  CONTEST_PRIZE_COMMITMENT: 'CONTEST_PRIZE_COMMITMENT',
  PAYOUT_LIABILITY: 'PAYOUT_LIABILITY',
  WITHDRAWAL_PENDING: 'WITHDRAWAL_PENDING',
  PLATFORM_FEE: 'PLATFORM_FEE',
  TAX_PAYABLE: 'TAX_PAYABLE',
  REFUND_CLEARING: 'REFUND_CLEARING',
};

// Normal balance side. An asset grows with debits; everything RazeKit owes or
// earns grows with credits. This is what makes a balance readable as a positive
// number without special-casing it at every call site.
export const NORMAL_SIDE = {
  BANK_SETTLEMENT: 'DEBIT',
  CLIENT_FUNDS: 'CREDIT',
  CONTEST_PRIZE_COMMITMENT: 'CREDIT',
  PAYOUT_LIABILITY: 'CREDIT',
  WITHDRAWAL_PENDING: 'CREDIT',
  PLATFORM_FEE: 'CREDIT',
  TAX_PAYABLE: 'CREDIT',
  REFUND_CLEARING: 'CREDIT',
};

export const OWNER_TYPE = { PLATFORM: 'PLATFORM', BRAND: 'BRAND', CREATOR: 'CREATOR', CONTEST: 'CONTEST' };

/** Which accounts are scoped to a subject, and which are single platform-wide books. */
const SHAPE = {
  BANK_SETTLEMENT: { owner: OWNER_TYPE.PLATFORM, scoped: false, label: 'Bank settlement account' },
  PLATFORM_FEE: { owner: OWNER_TYPE.PLATFORM, scoped: false, label: 'Platform fee income' },
  TAX_PAYABLE: { owner: OWNER_TYPE.PLATFORM, scoped: false, label: 'Tax payable' },
  REFUND_CLEARING: { owner: OWNER_TYPE.PLATFORM, scoped: false, label: 'Refunds pending transfer' },
  CLIENT_FUNDS: { owner: OWNER_TYPE.BRAND, scoped: true, label: 'Client funds held' },
  CONTEST_PRIZE_COMMITMENT: { owner: OWNER_TYPE.CONTEST, scoped: true, label: 'Prize committed to contest' },
  PAYOUT_LIABILITY: { owner: OWNER_TYPE.CREATOR, scoped: true, label: 'Available on RazeKit balance' },
  WITHDRAWAL_PENDING: { owner: OWNER_TYPE.CREATOR, scoped: true, label: 'Withdrawal in progress' },
};

/**
 * A stable, human-readable account code. Deterministic so the same subject
 * always resolves to the same account — no duplicate books for one brand.
 */
export function accountCode(accountClass, currency, subjectId) {
  const shape = SHAPE[accountClass];
  if (!shape) throw new Error(`UNKNOWN_ACCOUNT_CLASS:${accountClass}`);
  if (shape.scoped && !subjectId) throw new Error(`ACCOUNT_SUBJECT_REQUIRED:${accountClass}`);
  return shape.scoped
    ? `${accountClass}:${currency}:${subjectId}`
    : `${accountClass}:${currency}`;
}

export function normalSide(accountClass) {
  return NORMAL_SIDE[accountClass] || 'CREDIT';
}

/** Signed balance in the account's own normal direction. */
export function applyToBalance(accountClass, balanceMinor, direction, amountMinor) {
  const sign = direction === normalSide(accountClass) ? 1 : -1;
  return balanceMinor + sign * amountMinor;
}

/**
 * Find or create the account. Creation is idempotent on account_code, so two
 * concurrent postings for the same brand converge on one account rather than
 * silently splitting the balance in two.
 */
export async function getOrCreateAccount(svc, { accountClass, currency, subjectId, contestId }) {
  const code = accountCode(accountClass, currency, subjectId);
  const found = await svc.entities.LedgerAccount.filter({ account_code: code }, '-created_date', 1).catch(() => []);
  if (found.length) return found[0];

  const shape = SHAPE[accountClass];
  const created = await svc.entities.LedgerAccount.create({
    account_code: code,
    account_class: accountClass,
    label: shape.label,
    owner_type: shape.owner,
    owner_id: shape.scoped ? subjectId : null,
    contest_id: accountClass === ACCOUNT_CLASS.CONTEST_PRIZE_COMMITMENT ? subjectId : contestId || null,
    currency,
    status: 'active',
    balance_minor: 0,
  });

  // Lost a race? Keep the first one and let this duplicate die unused rather
  // than posting into a second book for the same subject.
  const all = await svc.entities.LedgerAccount.filter({ account_code: code }, 'created_date', 5).catch(() => [created]);
  return all[0] || created;
}

/**
 * The authoritative balance: replayed from the entries, not read from the
 * cached column. Used by verification and reconciliation, where trusting a
 * cache would defeat the point.
 */
export async function replayBalance(svc, account) {
  const entries = await svc.entities.LedgerEntry.filter({ account_id: account.id }, 'created_date', 10000).catch(() => []);
  let balance = 0;
  for (const e of entries) balance = applyToBalance(account.account_class, balance, e.direction, Number(e.amount_minor || 0));
  return { balance_minor: balance, entry_count: entries.length };
}

/**
 * Balance of one account class for one subject, replayed from entries.
 * Lives here rather than in events.ts so the balance read model can import it
 * without pulling in the posting side (and creating an import cycle).
 */
export async function balanceOf(svc, { accountClass, currency, subjectId }) {
  const account = await getOrCreateAccount(svc, { accountClass, currency, subjectId });
  const { balance_minor } = await replayBalance(svc, account);
  return { account, balance_minor };
}
