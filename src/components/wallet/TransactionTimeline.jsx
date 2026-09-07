import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IndianRupee, ArrowDownCircle, ArrowUpCircle, Trophy, RefreshCcw, Lock, Unlock, Filter, Download, X } from 'lucide-react';
import { formatINR } from '@/lib/contest-utils';
import ReceiptModal from './ReceiptModal';
import { EASE } from '@/lib/motion';

const TYPE_CONFIG = {
  deposit: { icon: ArrowDownCircle, label: 'Deposit', positive: true, cls: 'text-success', bg: 'bg-success/10' },
  withdrawal: { icon: ArrowUpCircle, label: 'Withdrawal', positive: false, cls: 'text-amber-400', bg: 'bg-amber-400/10' },
  prize: { icon: Trophy, label: 'Prize Won', positive: true, cls: 'text-primary', bg: 'bg-primary/10' },
  refund: { icon: RefreshCcw, label: 'Refund', positive: true, cls: 'text-blue-400', bg: 'bg-blue-400/10' },
  commission: { icon: IndianRupee, label: 'Commission', positive: false, cls: 'text-muted-foreground', bg: 'bg-secondary' },
  escrow_hold: { icon: Lock, label: 'Escrow Hold', positive: false, cls: 'text-blue-400', bg: 'bg-blue-400/10' },
  escrow_release: { icon: Unlock, label: 'Escrow Release', positive: true, cls: 'text-success', bg: 'bg-success/10' },
};

const STATUS_CONFIG = {
  pending: { cls: 'bg-amber-400/10 text-amber-400' },
  processing: { cls: 'bg-blue-400/10 text-blue-400' },
  completed: { cls: 'bg-success/10 text-success' },
  failed: { cls: 'bg-destructive/10 text-destructive' },
  cancelled: { cls: 'bg-secondary text-muted-foreground' },
  refunded: { cls: 'bg-blue-400/10 text-blue-400' },
  disputed: { cls: 'bg-destructive/10 text-destructive' },
  expired: { cls: 'bg-secondary text-muted-foreground' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'withdrawal', label: 'Withdrawals' },
  { key: 'prize', label: 'Prizes' },
];

export default function TransactionTimeline({ transactions, loading }) {
  const [filter, setFilter] = useState('all');
  const [receipt, setReceipt] = useState(null);

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.type === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold">Transaction History</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>{filtered.length} transactions</span>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${filter === f.key ? 'bg-primary text-primary-foreground shadow-primary-glow' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 glass-card rounded-xl animate-pulse" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((t, t_ix) => {
            const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.deposit;
            const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <motion.button key={t.id} onClick={() => setReceipt(t)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: Math.min(t_ix * 0.05, 0.4) }}
                whileHover={{ y: -2 }}
                className="w-full flex items-center gap-3 glass-card rounded-xl p-3.5 hover:shadow-glass-lg transition-shadow text-left">
                <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${cfg.cls}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.description || '—'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusCfg.cls}`}>{t.status}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(t.created_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold text-sm flex items-center justify-end ${cfg.positive ? 'text-success' : 'text-foreground'}`}>
                    {cfg.positive ? '+' : '−'}<IndianRupee className="w-3 h-3" />{Math.abs(t.amount).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{t.reference_number?.slice(0, 12) || ''}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-10 text-center">
          <IndianRupee className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="font-medium text-muted-foreground">No transactions yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Your transaction history will appear here.</p>
        </div>
      )}

      {receipt && <ReceiptModal transaction={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}