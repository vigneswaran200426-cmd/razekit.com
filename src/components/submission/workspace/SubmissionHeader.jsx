import { Check, Clock, Trophy } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';
import { formatINR } from '@/lib/contest-utils';
import { SUBMISSION_STATUS_LABELS } from '@/lib/submission/state-machine';

// Workspace header — the creator always sees contest, prize, deadline,
// time remaining and their submission status.
export default function SubmissionHeader({ contest, brandName, savedAt, submission }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-xl md:text-2xl font-bold truncate">{contest.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {brandName ? `by ${brandName}` : 'Brand contest'} · Creator submission
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-heading font-bold text-primary">{formatINR(contest.prize_amount)} <span className="text-xs font-normal text-muted-foreground">prize</span></p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-end mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            Deadline {new Date(contest.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        <span className="text-xs font-semibold bg-secondary text-primary px-3 py-1.5 rounded-full inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <CountdownTimer deadline={contest.deadline} /> remaining
        </span>
        {submission && (
          <span className="text-xs font-medium bg-card border border-border px-3 py-1.5 rounded-full inline-flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-muted-foreground" />
            Current version: {SUBMISSION_STATUS_LABELS[submission.status] || submission.status}
          </span>
        )}
        {savedAt && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 ml-auto" role="status">
            <Check className="w-3 h-3 text-success" aria-hidden /> Saved just now
          </span>
        )}
      </div>
    </div>
  );
}