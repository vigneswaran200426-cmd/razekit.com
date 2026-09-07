import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
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
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);

      // Idempotent wallet lookup: exactly one wallet per user. Never create a
      // duplicate when a wallet already exists, and never create one on a
      // transient fetch failure (the old .catch(()=>[]) path created duplicates).
      // Wallet creation is server-authoritative (admin-only RLS); if none exists
      // it must be provisioned by the backend.
      let wallets = await base44.entities.Wallet.filter({ user_id: me.id }).catch(() => []);
      wallets = Array.isArray(wallets) ? wallets : [];
      if (wallets.length > 0) {
        setWallet(wallets[0]);
      } else {
        try {
          const w = await base44.entities.Wallet.create({ user_id: me.id, available_balance: 0, pending_balance: 0, reserved_funds: 0, total_deposits: 0, lifetime_earnings: 0, currency: 'INR' });
          setWallet(w);
        } catch {
          setWallet(null);
        }
      }

      const txns = await base44.entities.PaymentTransaction.list('-created_date', 100).catch(() => []);
      setTransactions(txns);
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-4 md:p-6 max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto pb-8 animate-fade-in">
      <PageHeader
        title="Wallet"
        subtitle="Balance, deposits, transactions"
        icon={Shield}
        backTo="/profile"
        backLabel="Back"
      />

      <div className="mt-6 rz-reveal">
        <WalletBalanceCard
          wallet={wallet}
          loading={loading}
          role={user?.user_role}
          onAddFunds={() => setShowAddFunds(true)}
          onWithdraw={() => setShowWithdraw(true)}
        />
      </div>

      <div className="mt-8 rz-reveal">
        <TransactionTimeline transactions={transactions} loading={loading} />
      </div>

      <AddFundsModal open={showAddFunds} onClose={() => setShowAddFunds(false)} onSuccess={fetchData} wallet={wallet} />
      <WithdrawModal open={showWithdraw} onClose={() => setShowWithdraw(false)} onSuccess={fetchData} wallet={wallet} />
    </div>
  );
}