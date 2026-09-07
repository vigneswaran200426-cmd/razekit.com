import { Link } from 'react-router-dom';
import { IndianRupee, ArrowRight } from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import GlassCard from '@/components/ui/GlassCard';
import EmptyState from '@/components/ui/EmptyState';

// My Wins (§14): real outcomes with their post-win journey — no trophy-wall gamification.
export default function MyWinsSection({ contests = [], handovers = [], winnerPublishes = [] }) {
  if (!contests.length) {
    return (
      <EmptyState
        icon={ArrowRight}
        title="No wins yet"
        message="Your first win starts with your next submission."
        actionLabel="Find Contests"
        to="/explore"
        className="py-6"
      />
    );
  }
  return (
    <div className="space-y-3">
      {contests.map((c) => {
        const hov = handovers.find((h) => h.contest_id === c.id && !['expired', 'disputed'].includes(h.status));
        const wp = winnerPublishes.find((w) => w.contest_id === c.id);
        return (
          <GlassCard key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <Link to={`/contest/${c.id}/winner`} className="font-heading font-semibold text-sm hover:text-primary">{c.title}</Link>
              <StatusPill tone={c.status === 'completed' ? 'success' : 'info'}>{c.status === 'completed' ? 'Completed' : 'In progress'}</StatusPill>
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <IndianRupee className="w-3 h-3" />{c.prize_amount?.toLocaleString('en-IN')} · Payment {c.status === 'completed' ? 'Confirmed' : 'Processing'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {hov && <StatusPill tone={hov.status === 'completed' ? 'success' : 'info'}>Handover: {hov.status.replace(/_/g, ' ')}</StatusPill>}
              {!hov && c.post_winner_action === 'CLIENT_COLLABORATION' && (
                <StatusPill tone={c.status === 'completed' ? 'success' : 'accent'}>Collaboration: {c.status === 'completed' ? 'Completed' : 'Active'}</StatusPill>
              )}
              {wp && <StatusPill tone={wp.status === 'published' ? 'success' : 'info'}>Winners Hub: {wp.status === 'published' ? 'Published' : 'In progress'}</StatusPill>}
            </div>
            <Link to={`/contest/${c.id}/winner`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline mt-2.5">
              Open winner journey <ArrowRight className="w-3 h-3" />
            </Link>
          </GlassCard>
        );
      })}
    </div>
  );
}