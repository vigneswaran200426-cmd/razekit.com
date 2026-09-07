import { IndianRupee, ArrowDownToLine, TrendingUp, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WalletCard({ balance, pending, transactions }) {
  const recentTxns = transactions.slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-primary/10 via-card to-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Available Balance</p>
          <p className="font-heading text-3xl font-bold flex items-center text-primary">
            <IndianRupee className="w-7 h-7" />{balance.toLocaleString('en-IN')}
          </p>
        </div>
        <Link to="/funds" className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
          <ArrowDownToLine className="w-4 h-4" /> Withdraw
        </Link>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
            <Clock className="w-3 h-3" />
            <span className="text-[11px]">Pending</span>
          </div>
          <p className="text-sm font-semibold flex items-center">
            <IndianRupee className="w-3 h-3" />{pending.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="flex-1 bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
            <TrendingUp className="w-3 h-3" />
            <span className="text-[11px]">Total</span>
          </div>
          <p className="text-sm font-semibold flex items-center">
            <IndianRupee className="w-3 h-3" />{balance.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {recentTxns.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Recent</p>
          {recentTxns.map(t => (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground line-clamp-1 flex-1 mr-2">{t.description || t.type}</span>
              <span className={`font-medium ${t.type === 'reserved' ? 'text-orange-500' : 'text-success'}`}>
                {t.type === 'reserved' ? '-' : '+'}<span className="flex items-center"><IndianRupee className="w-3 h-3" />{Math.abs(t.amount || 0).toLocaleString('en-IN')}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}