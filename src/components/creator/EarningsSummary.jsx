import { Link } from 'react-router-dom';
import { IndianRupee, ArrowRight } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

// Compact earnings summary (§15) — detail lives in the Wallet.
export default function EarningsSummary({ wallet }) {
  const available = wallet?.available_balance || 0;
  const lifetime = wallet?.lifetime_earnings || 0;
  return (
    <GlassCard className="p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Earnings</p>
      <p className="font-heading text-2xl font-bold text-primary flex items-center"><IndianRupee className="w-5 h-5" />{available.toLocaleString('en-IN')}</p>
      {lifetime > available && (
        <p className="text-xs text-muted-foreground mt-0.5">Lifetime {lifetime.toLocaleString('en-IN')} · available now {available.toLocaleString('en-IN')}</p>
      )}
      <Link to="/wallet" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline mt-2.5">View Earnings <ArrowRight className="w-3 h-3" /></Link>
    </GlassCard>
  );
}