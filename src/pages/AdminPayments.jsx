import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IndianRupee, TrendingUp, Clock, CheckCircle, AlertTriangle, Shield, Lock, ArrowLeft, Activity, Banknote, AlertOctagon } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatINR } from '@/lib/contest-utils';

export default function AdminPayments() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState({ dailyRevenue: 0, monthlyRevenue: 0, commission: 0, pendingWithdrawals: 0, completedWithdrawals: 0, failedPayments: 0, disputes: 0 });
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [fraudAlerts, setFraudAlerts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me?.role !== 'admin') { setLoading(false); return; }

        const [txns, withdrawalReqs, alerts] = await Promise.all([
          base44.entities.PaymentTransaction.list('-created_date', 100),
          base44.entities.WithdrawalRequest.list('-created_date', 50),
          base44.entities.FraudAlert.list('-created_date', 50),
        ]);

        const now = Date.now();
        const dayAgo = now - 86400000;
        const monthAgo = now - 30 * 86400000;
        const dailyRev = txns.filter(t => t.type === 'deposit' && t.status === 'completed' && new Date(t.created_date).getTime() > dayAgo).reduce((s, t) => s + t.amount, 0);
        const monthlyRev = txns.filter(t => t.type === 'deposit' && t.status === 'completed' && new Date(t.created_date).getTime() > monthAgo).reduce((s, t) => s + t.amount, 0);
        const commission = txns.filter(t => t.commission).reduce((s, t) => s + (t.commission || 0), 0);
        const pendingWd = withdrawalReqs.filter(w => w.status === 'pending' || w.status === 'processing');
        const completedWd = withdrawalReqs.filter(w => w.status === 'completed');
        const failed = txns.filter(t => t.status === 'failed');
        const disputed = txns.filter(t => t.status === 'disputed');

        setStats({
          dailyRevenue: dailyRev,
          monthlyRevenue: monthlyRev,
          commission,
          pendingWithdrawals: pendingWd.length,
          completedWithdrawals: completedWd.length,
          failedPayments: failed.length,
          disputes: disputed.length,
        });
        setTransactions(txns);
        setWithdrawals(pendingWd);
        setFraudAlerts(alerts.filter(a => a.status === 'flagged' || a.status === 'reviewing'));
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
        <Link to="/" className="text-primary text-sm hover:underline mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const statCards = [
    { label: 'Daily Revenue', value: formatINR(stats.dailyRevenue), icon: IndianRupee, color: 'text-primary' },
    { label: 'Monthly Revenue', value: formatINR(stats.monthlyRevenue), icon: TrendingUp, color: 'text-success' },
    { label: 'Commission', value: formatINR(stats.commission), icon: Activity, color: 'text-cyan-400' },
    { label: 'Pending Withdrawals', value: stats.pendingWithdrawals, icon: Clock, color: 'text-amber-400' },
    { label: 'Completed', value: stats.completedWithdrawals, icon: CheckCircle, color: 'text-success' },
    { label: 'Failed Payments', value: stats.failedPayments, icon: AlertTriangle, color: 'text-destructive' },
    { label: 'Disputes', value: stats.disputes, icon: AlertOctagon, color: 'text-destructive' },
    { label: 'Fraud Alerts', value: fraudAlerts.length, icon: Shield, color: 'text-amber-500' },
  ];

  const handleWithdrawal = async (id, status) => {
    await base44.entities.WithdrawalRequest.update(id, { status, processed_at: new Date().toISOString() }).catch(() => {});
    setWithdrawals(prev => prev.filter(w => w.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Payment Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <Icon className={`w-5 h-5 ${s.color} mb-2`} />
              <p className="text-xl font-heading font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mb-4">
        {['overview', 'withdrawals', 'fraud'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {t === 'fraud' ? 'Fraud Alerts' : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions yet.</p>
          ) : transactions.slice(0, 20).map(t => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Banknote className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{t.type} · {t.reference_number?.slice(0, 12)}</p>
                <p className="text-xs text-muted-foreground">{new Date(t.created_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold flex items-center justify-end"><IndianRupee className="w-3 h-3" />{t.amount.toLocaleString('en-IN')}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${t.status === 'completed' ? 'bg-success/10 text-success' : t.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-amber-400/10 text-amber-400'}`}>{t.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'withdrawals' && (
        <div className="space-y-2">
          {withdrawals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pending withdrawals.</p>
          ) : withdrawals.map(w => (
            <div key={w.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{w.user_name || 'User'} · {w.bank_name} ****{w.bank_account_last4}</p>
                  <p className="text-xs text-muted-foreground">{formatINR(w.amount)} · Net {formatINR(w.net_amount)}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-400/10 text-amber-400 font-medium">{w.status}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleWithdrawal(w.id, 'completed')} className="flex-1 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:bg-success/90 transition-colors">
                  Approve & Transfer
                </button>
                <button onClick={() => handleWithdrawal(w.id, 'failed')} className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'fraud' && (
        <div className="space-y-2">
          {fraudAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No fraud alerts. All clear.</p>
          ) : fraudAlerts.map(a => (
            <div key={a.id} className="bg-card border border-destructive/30 rounded-xl p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${a.severity === 'critical' || a.severity === 'high' ? 'bg-destructive/10' : 'bg-amber-400/10'}`}>
                <AlertTriangle className={`w-4 h-4 ${a.severity === 'critical' || a.severity === 'high' ? 'text-destructive' : 'text-amber-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{a.alert_type?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground">{a.details}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${a.severity === 'critical' ? 'bg-destructive text-destructive-foreground' : a.severity === 'high' ? 'bg-destructive/10 text-destructive' : 'bg-amber-400/10 text-amber-400'}`}>{a.severity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}