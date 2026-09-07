import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { IndianRupee, Plus, ArrowDownCircle, ArrowUpCircle, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AddFundsDialog from '@/components/AddFundsDialog';
import { motion } from 'framer-motion';
import { EASE } from '@/lib/motion';

function calcBalance(transactions) {
  return transactions.reduce((sum, t) => {
    if (t.type === 'add' || t.type === 'release') return sum + t.amount;
    if (t.type === 'reserve' || t.type === 'payout') return sum - t.amount;
    return sum;
  }, 0);
}

const TYPE_LABELS = {
  add: 'Wallet Funded', reserve: 'Reserved for Contest', release: 'Payment Released', payout: 'Payout',
};

const TYPE_ICONS = {
  add: ArrowDownCircle, reserve: Lock, release: ArrowUpCircle, payout: ArrowUpCircle,
};

export default function Funds() {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddFunds, setShowAddFunds] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const txns = await base44.entities.FundsTransaction.list('-created_date', 100);
      setTransactions(txns);
      setBalance(calcBalance(txns));
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">Add money and view your wallet activity</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="glass-card rounded-3xl bg-gradient-to-br from-primary/10 via-white/30 to-white/0 p-6 mb-8 shadow-glass-lg"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Available balance</p>
            <p className="font-heading text-3xl md:text-4xl font-bold text-success">₹{balance.toLocaleString('en-IN')}</p>
          </div>
          <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
            <IndianRupee className="w-7 h-7 text-success" />
          </div>
        </div>
        <Button onClick={() => setShowAddFunds(true)} className="mt-4"><Plus className="w-4 h-4 mr-2" /> Add to wallet</Button>
      </motion.div>

      <h2 className="font-heading text-lg font-semibold mb-4">Activity</h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 glass-card rounded-xl animate-pulse" />)}
        </div>
      ) : transactions.length > 0 ? (
        <div className="space-y-2">
          {transactions.map(t => {
            const Icon = TYPE_ICONS[t.type] || ArrowDownCircle;
            const isPositive = t.type === 'add' || t.type === 'release';
            return (
              <div key={t.id} className="glass-card rounded-xl p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPositive ? 'bg-success/10' : 'bg-destructive/10'}`}>
                  <Icon className={`w-5 h-5 ${isPositive ? 'text-success' : 'text-destructive'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{TYPE_LABELS[t.type] || t.type}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.description || '—'}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                    {isPositive ? '+' : '−'}₹{t.amount.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_date).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-10 text-center">
          <IndianRupee className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No transactions yet</p>
          <Button variant="outline" onClick={() => setShowAddFunds(true)}><Plus className="w-4 h-4 mr-2" /> Add to wallet</Button>
        </div>
      )}

      <AddFundsDialog open={showAddFunds} onOpenChange={setShowAddFunds} onSuccess={fetchData} />
    </div>
  );
}