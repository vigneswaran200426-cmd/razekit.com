import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Wallet as WalletIcon } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, moneyMinor, dateShort } from '@/lib/format';
import { PageHeader, Card, EmptyState, Skeleton, Badge } from '@/components/ui';

const bal = (w, field) => (w && w[field] != null ? money(w[field], w.currency) : moneyMinor(w?.[`${field}_minor`], w?.currency));

export default function Wallet() {
  const { user, role } = useAuth();
  const [wallet, setWallet] = useState(undefined);
  const [ledger, setLedger] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    entities.Wallet.filter({ user_id: user.id }, '-created_date', 1).then((w) => setWallet((w || [])[0] || null)).catch(() => setWallet(null));
    entities.WalletLedgerEntry.filter({ user_id: user.id }, '-created_date', 30).then((l) => setLedger(l || [])).catch(() => setLedger([]));
  }, [user?.id]);

  const isClient = role === 'client';

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={isClient ? 'Payments' : 'Earnings'} title={isClient ? 'Wallet' : 'Earnings'} description={isClient ? 'Your funding, fees and balances.' : 'Your winnings, payouts and transactions.'} />

      {wallet === undefined ? (
        <div className="grid sm:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card className="p-5 sm:col-span-1 bg-ink text-white border-ink">
            <p className="text-[12px] font-medium text-white/60 flex items-center gap-1.5"><WalletIcon className="w-4 h-4" />Available</p>
            <p className="mt-2 font-display text-3xl font-extrabold nums">{bal(wallet, 'available_balance')}</p>
          </Card>
          <Card className="p-5"><p className="text-[12px] font-medium text-muted">{isClient ? 'Reserved (in escrow)' : 'Pending'}</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink nums">{bal(wallet, isClient ? 'reserved_funds' : 'pending_balance')}</p></Card>
          <Card className="p-5"><p className="text-[12px] font-medium text-muted">{isClient ? 'Total deposited' : 'Lifetime earnings'}</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-ink nums">{bal(wallet, isClient ? 'total_deposits' : 'lifetime_earnings')}</p></Card>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-ink">Transactions</h2>
        {ledger === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : ledger.length ? (
          <Card className="divide-y divide-line">
            {ledger.map((t) => {
              const credit = t.direction === 'CREDIT';
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`grid h-9 w-9 place-items-center rounded-md ${credit ? 'bg-success/10 text-success' : 'bg-surface-2 text-muted'}`}>{credit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink truncate">{t.description || t.entry_type}</p><p className="text-xs text-muted">{dateShort(t.created_date)} · {t.reference}</p></div>
                  <span className={`text-sm font-semibold nums ${credit ? 'text-success' : 'text-ink'}`}>{credit ? '+' : '−'}{moneyMinor(t.amount_minor, t.currency)}</span>
                </div>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon={WalletIcon} title="No transactions yet" description={isClient ? 'Funding and fees will appear here.' : 'Your winnings and payouts will appear here.'} />
        )}
      </section>
    </div>
  );
}
