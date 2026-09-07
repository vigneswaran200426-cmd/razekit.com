import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import StatusPill from '@/components/ui/StatusPill';
import AlertState from '@/components/alerts/AlertState';

const GROUPS = [
  { id: 'awaiting_you', label: 'Awaiting Your Approval', statuses: ['submitted_for_approval'], tone: 'warning' },
  { id: 'awaiting_creator', label: 'With the Creator', statuses: ['content_requested', 'revision_requested'], tone: 'info' },
  { id: 'approved', label: 'Approved & Processing', statuses: ['approved', 'processing'], tone: 'accent' },
  { id: 'published', label: 'Published', statuses: ['published'], tone: 'success' },
];

// Winner Content board — current publishing state per contest, one action per row.
export default function WinnerContentBoard({ winnerPublishes = [], contests = [] }) {
  if (!winnerPublishes.length) {
    return <AlertState state="NO_WINNER_CONTENT" className="max-w-none" />;
  }

  return (
    <GlassCard className="p-5 space-y-5">
      {GROUPS.map((g) => {
        const rows = winnerPublishes.filter((w) => g.statuses.includes(w.status));
        if (!rows.length) return null;
        return (
          <div key={g.id}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{g.label}</p>
            <div className="space-y-2">
              {rows.map((w) => {
                const contest = contests.find((c) => c.id === w.contest_id);
                return (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{w.title || contest?.title || 'Winner content'}</p>
                      {contest && <p className="text-xs text-muted-foreground truncate">{contest.title}</p>}
                    </div>
                    <StatusPill tone={g.tone}>
                      {w.status === 'revision_requested' ? 'Revision requested'
                        : w.status === 'content_requested' ? 'Content requested'
                        : w.status.replace(/_/g, ' ')}
                    </StatusPill>
                    <Link to={`/contest/${w.contest_id}/winner`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0">
                      Open <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </GlassCard>
  );
}