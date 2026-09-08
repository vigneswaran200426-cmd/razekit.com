import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import WalletBalanceCard from '@/components/wallet/WalletBalanceCard';
import TransactionTimeline from '@/components/wallet/TransactionTimeline';
import AddFundsModal from '@/components/wallet/AddFundsModal';
import WithdrawModal from '@/components/wallet/WithdrawModal';
import PageHeader from '@/components/ui/PageHeader';

export default function Wallet() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const me = await base44.auth.me();
      setUser(me);
      const wallets = await base44.entities.Wallet.filter({ user_id: me.id }).catch(() => []);
      setWallet(Array.isArray(wallets) && wallets.length ? wallets[0] : null);
      const txns = await base44.entities.PaymentTransaction.list('-created_date', 100);
      setTransactions(Array.isArray(txns) ? txns : []);
    } catch (e) {
      setError(e?.message || 'We could not load your wallet right now.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="page-shell pb-10">
      <div className="max-w-5xl mx-auto space-y-5">
        <PageHeader title="Wallet" subtitle="Funds, prize reservations, earnings and transaction history" icon={Shield} backTo="/profile" backLabel="Back" />

        {error && <section role="alert" className="surface border-red-200 p-4 flex items-center justify-between gap-3"><p className="text-sm text-red-700">{error}</p><button type="button" onClick={fetchData} className="rz-secondary-action inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"><RefreshCw className="w-3.5 h-3.5" /> Retry</button></section>}

        <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground">Current balance</h2><span className="rz-status rz-status--info">{user?.user_role === 'client' ? 'Client wallet' : 'Creator wallet'}</span></div><WalletBalanceCard wallet={wallet} loading={loading} role={user?.user_role} onAddFunds={() => setShowAddFunds(true)} onWithdraw={() => setShowWithdraw(true)} /></section>
        <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground">Transactions</h2><span className="text-xs text-muted-foreground nums">{transactions.length} records</span></div><TransactionTimeline transactions={transactions} loading={loading} /></section>

        <p className="text-xs text-muted-foreground">Payment status is displayed from wallet/transaction records. Refreshing this page re-reads the current backend state; it does not infer a successful payment from a client-side callback.</p>

        <AddFundsModal open={showAddFunds} onClose={() => setShowAddFunds(false)} onSuccess={fetchData} wallet={wallet} />
        <WithdrawModal open={showWithdraw} onClose={() => setShowWithdraw(false)} onSuccess={fetchData} wallet={wallet} />
      </div>
    </div>
  );
}
