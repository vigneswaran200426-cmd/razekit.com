import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, LayoutList, MessageSquare, CheckSquare, Clock, ShieldCheck } from 'lucide-react';
import { useHandover } from '@/hooks/useHandover';
import HandoverProgress from '@/components/handover/HandoverProgress';
import CountdownTimer from '@/components/CountdownTimer';
import { isHandoverExpired } from '@/lib/handover-utils';

const BASE_TABS = [
  { key: 'status', label: 'Status', suffix: '', icon: LayoutList },
  { key: 'guide', label: 'Guide', suffix: '/guide', icon: BookOpen },
  { key: 'room', label: 'Room', suffix: '/room', icon: MessageSquare },
];

// Wraps every handover screen: access control, header, countdown, progress, sub-navigation.
export default function HandoverShell({ contestId, active, children }) {
  const ctx = useHandover(contestId);

  if (ctx.loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!ctx.contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;

  if (!ctx.authorized) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto pb-8 text-center">
        <div className="glass-card rounded-2xl p-8">
          <ShieldCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-heading font-semibold mb-1">Private handover</p>
          <p className="text-sm text-muted-foreground">This handover is only accessible to the brand and the winning creator.</p>
        </div>
      </div>
    );
  }

  const confirmTab = ctx.isClient
    ? { key: 'complete', label: 'Confirm', suffix: '/complete', icon: CheckSquare }
    : { key: 'confirm', label: 'Confirm', suffix: '/confirm', icon: CheckSquare };
  const tabs = [...BASE_TABS, confirmTab];
  const h = ctx.handover;
  const showCountdown = !!h?.started_at && h.status !== 'completed';
  const expired = isHandoverExpired(h);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-8">
      <Link to={`/contest/${contestId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Contest
      </Link>

      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="font-heading text-xl md:text-2xl font-bold">Account Handover</h1>
        {showCountdown && (
          <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
            expired ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
          }`}>
            <Clock className="w-3 h-3" />
            {expired ? 'Deadline passed' : <CountdownTimer deadline={h.deadline} />}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4 truncate">{ctx.contest.title}</p>

      <HandoverProgress handover={h} contest={ctx.contest} />

      <nav className="grid grid-cols-4 gap-1 my-4 bg-secondary/60 rounded-xl p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              to={`/contest/${contestId}/handover${t.suffix}`}
              className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition-all ${
                isActive ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children(ctx)}
    </div>
  );
}