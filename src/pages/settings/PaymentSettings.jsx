import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowUpRight, CreditCard, Banknote, Receipt, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SettingsSection from '@/components/settings/SettingsSection';

export default function PaymentSettings() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [funds, setFunds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const w = await base44.entities.Wallet.filter({ user_id: me.id }, '-created_date', 1).catch(() => []);
        setWallet(w[0] || null);
        const [wd, tx, fd] = await Promise.all([
          base44.entities.WithdrawalRequest.filter({ user_id: me.id }, '-created_date', 20).catch(() => []),
          base44.entities.PaymentTransaction.filter({ user_id: me.id }, '-created_date', 20).catch(() => []),
          base44.entities.Fund.list('-created_date', 20).catch(() => []),
        ]);
        setWithdrawals(wd); setTransactions(tx); setFunds(fd);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const isClient = user?.user_role === 'client';
  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <SettingsSection title="Payments & Payouts">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{isClient ? 'Wallet balance' : 'Available earnings'}</p>
            <p className="font-heading text-2xl font-bold">{fmt(wallet?.available_balance)}</p>
          </div>
          <Link to="/wallet" className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open wallet <ChevronRight className="w-4 h-4" /></Link>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Balances are managed securely. Use the wallet for deposits, withdrawals and prize transfers.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : isClient ? (
        <>
          <SectionCard icon={CreditCard} title="Payment methods" desc="Add money & manage how you pay for contests">
            <Link to="/wallet" className="text-sm font-medium text-primary inline-flex items-center gap-1">Add to Wallet <ArrowUpRight className="w-4 h-4" /></Link>
          </SectionCard>
          <HistoryList title="Wallet activity" items={funds.map(f => ({ id: f.id, label: f.description || f.type, value: `${f.type === 'reserved' ? '-' : '+'}${fmt(f.amount)}`, date: f.created_date }))} empty="No wallet activity yet" />
          <HistoryList title="Transaction history" items={transactions.map(t => ({ id: t.id, label: t.description || t.type, value: fmt(t.amount), date: t.created_date }))} empty="No transactions yet" />
        </>
      ) : (
        <>
          <SectionCard icon={Banknote} title="Payout method" desc="Withdraw your earnings to your bank account">
            <Link to="/wallet" className="text-sm font-medium text-primary inline-flex items-center gap-1">Withdraw <ArrowUpRight className="w-4 h-4" /></Link>
          </SectionCard>
          <HistoryList title="Payout history" items={withdrawals.map(w => ({ id: w.id, label: `Withdrawal · ${w.bank_name || 'Bank'} ••${w.bank_account_last4 || ''}`, value: fmt(w.net_amount || w.amount), date: w.requested_at || w.created_date, status: w.status }))} empty="No payouts yet" />
          <HistoryList title="Earnings history" items={transactions.filter(t => t.type === 'prize').map(t => ({ id: t.id, label: t.description || 'Prize payout', value: `+${fmt(t.amount)}`, date: t.created_date }))} empty="No earnings yet" />
        </>
      )}

      <div className="bg-secondary/50 border border-border rounded-xl p-4 flex gap-2 text-xs text-muted-foreground">
        <Receipt className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Wallet balances, fees and escrow state are never edited here — all financial actions go through the secure wallet. For tax documents, contact support.</p>
      </div>
    </SettingsSection>
  );
}

function SectionCard({ icon: Icon, title, desc, children }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function HistoryList({ title, items, empty }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{title}</h3>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{empty}</div>
        ) : items.map(i => (
          <div key={i.id} className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{i.label}</p>
              {i.date && <p className="text-xs text-muted-foreground">{new Date(i.date).toLocaleDateString('en-IN')}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-medium">{i.value}</p>
              {i.status && <p className="text-xs text-muted-foreground capitalize">{i.status.replace('_', ' ')}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}