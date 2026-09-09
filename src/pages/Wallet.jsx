import { useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon, Lock, Clock, TrendingUp,
} from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, moneyMinor, dateShort } from '@/lib/format';
import { PageHeader, Card, EmptyState, Skeleton, Badge, StatTile, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

const bal = (w, field) => (w && w[field] != null ? money(w[field], w.currency) : moneyMinor(w?.[`${field}_minor`], w?.currency));

export default function Wallet() {
  const { user, role } = useAuth();
  const [wallet, setWallet] = useState(undefined);
  const [ledger, setLedger] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    entities.Wallet.filter({ user_id: user.id }, '-created_date', 1)
      .then((w) => setWallet((w || [])[0] || null))
      .catch(() => { setWallet(null); setErr('Some wallet data could not be loaded. Refresh the page to try again.'); });
    entities.WalletLedgerEntry.filter({ user_id: user.id }, '-created_date', 30)
      .then((l) => setLedger(l || []))
      .catch(() => { setLedger([]); setErr('Some wallet data could not be loaded. Refresh the page to try again.'); });
  }, [user?.id]);

  const isClient = role === 'client';
  const currency = wallet?.currency || 'INR';

  return (
    <div className="space-y-6">
      <PageHeader
        title={isClient ? 'Wallet' : 'Earnings'}
        description={isClient ? 'Your funding, fees and balances.' : 'Your winnings, payouts and transactions.'}
      />

      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}

      {/* ── Balances ─────────────────────────────────────────────────────── */}
      {wallet === undefined ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-lg sm:col-span-2 lg:col-span-1" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* The one number that matters most on this page. */}
          <Card className="p-5 sm:col-span-2 lg:col-span-1 bg-ink text-white border-ink">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
              <WalletIcon className="w-4 h-4" aria-hidden="true" />Available
            </p>
            <p className="mt-2 font-display text-3xl font-extrabold nums">{bal(wallet, 'available_balance')}</p>
            <p className="mt-1 text-[11px] text-white/50">Balance in {currency}</p>
          </Card>

          <StatTile
            label={isClient ? 'Reserved (in escrow)' : 'Pending'}
            value={bal(wallet, isClient ? 'reserved_funds' : 'pending_balance')}
            icon={isClient ? Lock : Clock}
          />
          <StatTile
            label={isClient ? 'Total deposited' : 'Lifetime earnings'}
            value={bal(wallet, isClient ? 'total_deposits' : 'lifetime_earnings')}
            icon={TrendingUp}
          />
        </div>
      )}

      {/* ── Ledger ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">Transactions</h2>
          {ledger?.length ? (
            <Badge tone="neutral">{ledger.length} {ledger.length === 1 ? 'entry' : 'entries'}</Badge>
          ) : null}
        </div>

        {ledger === null ? (
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-9 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-20 shrink-0" />
                </div>
              ))}
            </div>
          </Card>
        ) : ledger.length ? (
          <>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {ledger.map((t) => {
                  const credit = t.direction === 'CREDIT';
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', credit ? 'bg-success/10 text-success' : 'bg-surface-2 text-muted')}>
                        {credit
                          ? <ArrowDownLeft className="w-4 h-4" aria-hidden="true" />
                          : <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
                        <span className="sr-only">{credit ? 'Money in' : 'Money out'}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{t.description || t.entry_type}</p>
                        <p className="text-xs text-muted truncate">
                          {dateShort(t.created_date)}{t.reference ? ` · ${t.reference}` : ''}
                        </p>
                      </div>
                      <span className={cn('shrink-0 font-display text-sm font-extrabold nums', credit ? 'text-success' : 'text-ink')}>
                        {credit ? '+' : '−'}{moneyMinor(t.amount_minor, t.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
            {ledger.length === 30 && (
              <p className="text-xs text-muted">Showing your 30 most recent entries.</p>
            )}
          </>
        ) : (
          <EmptyState
            icon={WalletIcon}
            title={isClient ? 'No transactions yet' : 'No earnings yet'}
            description={isClient
              ? 'Funding and fees will appear here as soon as your first contest is live.'
              : 'Your winnings and payouts will appear here once a contest you entered is finalized.'}
            action={
              <Button to={isClient ? '/create-contest' : '/explore'}>
                {isClient ? 'Create a contest' : 'Browse open contests'}
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
