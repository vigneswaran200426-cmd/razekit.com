// LedgerService — append-only, currency-separated wallet ledger.
// A wallet's balance is the ledger's last entry, never a trusted mutable field.
// Wallets are per user AND per currency — currencies are never merged.

import { makeRef } from './core.ts';

export async function getOrCreateWallet(sdk, userId, currency) {
  const wallets = await sdk.entities.Wallet.filter({ user_id: userId, currency });
  if (wallets.length) return wallets[0];
  return sdk.entities.Wallet.create({
    user_id: userId,
    currency,
    available_balance: 0,
    pending_balance: 0,
    reserved_funds: 0,
    total_deposits: 0,
    lifetime_earnings: 0,
  });
}

async function currentBalanceMinor(sdk, walletId) {
  const last = await sdk.entities.WalletLedgerEntry.filter({ wallet_id: walletId }, '-created_date', 1);
  return (last[0] && last[0].balance_after_minor) || 0;
}

// Append a chain of entries to one owner's wallet in one currency.
// Throws on a negative resulting balance — negative balances are never allowed
// silently; reversals must be explicit and reconciled.
export async function appendLedger(sdk, { userId, currency, contestId, paymentId, payoutId, entries }) {
  const wallet = await getOrCreateWallet(sdk, userId, currency);
  let balance = await currentBalanceMinor(sdk, wallet.id);
  const created = [];
  for (const entry of entries) {
    const amountMinor = Math.round(entry.amountMinor);
    if (!Number.isFinite(amountMinor) || amountMinor < 0) {
      throw new Error(`LEDGER_INVALID_AMOUNT:${entry.amountMinor}`);
    }
    balance += entry.direction === 'CREDIT' ? amountMinor : -amountMinor;
    if (balance < 0) {
      throw new Error(`LEDGER_NEGATIVE_BALANCE:${balance}`);
    }
    const record = await sdk.entities.WalletLedgerEntry.create({
      wallet_id: wallet.id,
      user_id: userId,
      reference: makeRef('RK-TXN'),
      currency,
      entry_type: entry.entryType,
      direction: entry.direction,
      amount_minor: amountMinor,
      balance_after_minor: balance,
      contest_id: contestId || null,
      related_payment_id: paymentId || null,
      related_payout_id: payoutId || null,
      description: entry.description || '',
      metadata: JSON.stringify(entry.metadata || {}),
    });
    created.push(record);
  }
  return { wallet, balanceMinor: balance, entries: created };
}