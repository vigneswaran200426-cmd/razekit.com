import { motion } from 'framer-motion';
import { IndianRupee, ArrowDownToLine, ArrowUpFromLine, Clock, Lock, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { EASE } from '@/lib/motion';

export default function WalletBalanceCard({ wallet, onAddFunds, onWithdraw, loading, role }) {
  const available = wallet?.available_balance || 0;
  const pending = wallet?.pending_balance || 0;
  const reserved = wallet?.reserved_funds || 0;
  const totalDeposits = wallet?.total_deposits || 0;
  const lifetimeEarnings = wallet?.lifetime_earnings || 0;

  const isClient = role === 'client';
  const balanceLabel = isClient ? 'Available Balance' : 'Available Earnings';
  const primaryAction = isClient
    ? { label: 'Add to Wallet', icon: ArrowDownToLine, onClick: onAddFunds, primary: true }
    : { label: 'Withdraw', icon: ArrowUpFromLine, onClick: onWithdraw, primary: true };
  const secondaryAction = isClient
    ? { label: 'Withdraw', icon: ArrowUpFromLine, onClick: onWithdraw, primary: false }
    : { label: 'Add to Wallet', icon: ArrowDownToLine, onClick: onAddFunds, primary: false };

  // Role-specific stat cards
  const statCards = isClient ? [
    { label: 'Contest Spending', value: reserved, icon: Lock, color: 'text-blue-400' },
    { label: 'Reserved Balance', value: reserved, icon: Clock, color: 'text-amber-400' },
    { label: 'Lifetime Spending', value: totalDeposits, icon: TrendingUp, color: 'text-success' },
  ] : [
    { label: 'Pending Earnings', value: pending, icon: Clock, color: 'text-amber-400' },
    { label: 'Lifetime Earnings', value: lifetimeEarnings, icon: TrendingUp, color: 'text-success' },
    { label: 'Reserved', value: reserved, icon: Lock, color: 'text-blue-400' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-3xl p-5 md:p-6 shadow-glass-lg text-foreground"
      style={{background: 'linear-gradient(135deg, hsl(214 60% 97%) 0%, hsl(196 100% 93% / 0.6) 50%, hsl(214 60% 97%) 100%)', border: '1px solid rgba(26,123,248,0.12)'}}
    >
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/5 blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <WalletIcon className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{balanceLabel}</p>
            </div>
            {loading ? (
              <div className="h-10 w-40 bg-secondary/50 rounded-lg animate-pulse" />
            ) : (
              <p className="font-heading text-3xl md:text-4xl font-bold text-foreground flex items-center">
                <IndianRupee className="w-7 h-7 md:w-8 md:h-8" />
                {available.toLocaleString('en-IN')}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={primaryAction.onClick}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200 hover:-translate-y-px active:scale-[0.98] ${
              primaryAction.primary
                ? 'bg-primary text-primary-foreground hover:bg-[#0B48E8] hover:shadow-primary-glow'
                : 'bg-secondary text-foreground hover:bg-secondary/80 border border-border hover:shadow-glass'
            }`}>
            <primaryAction.icon className="w-4 h-4" /> {primaryAction.label}
          </button>
          <button onClick={secondaryAction.onClick}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200 hover:-translate-y-px active:scale-[0.98] ${
              secondaryAction.primary
                ? 'bg-primary text-primary-foreground hover:bg-[#0B48E8] hover:shadow-primary-glow'
                : 'bg-secondary text-foreground hover:bg-secondary/80 border border-border hover:shadow-glass'
            }`}>
            <secondaryAction.icon className="w-4 h-4" /> {secondaryAction.label}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white/50 backdrop-blur-sm rounded-xl p-3 border border-border/50">
                <div className="flex items-center gap-1 mb-1">
                  <Icon className={`w-3 h-3 ${card.color}`} />
                  <span className="text-[11px] text-muted-foreground">{card.label}</span>
                </div>
                <p className="text-sm font-semibold flex items-center">
                  <IndianRupee className="w-3 h-3" />{card.value.toLocaleString('en-IN')}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}