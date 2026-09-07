import { IndianRupee, Clock, Users, Trophy } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';

// Prize / deadline / entries summary — the sticky action panel on desktop and
// the compact summary card on mobile. Actions are passed in by the page so all
// contest-state logic stays in one place.
export default function ContestSummaryPanel({ contest, entriesCount, children }) {
  return (
    <div className="surface rounded-2xl p-5 space-y-4 elev-1">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Prize</p>
        <p className="font-heading text-3xl font-bold text-primary flex items-center nums">
          <IndianRupee className="w-6 h-6" />{contest.prize_amount?.toLocaleString('en-IN')}
        </p>
        {contest.number_of_winners > 1 && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Trophy className="w-3 h-3" />{contest.number_of_winners} winners
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Deadline</p>
          <p className="text-sm font-semibold flex items-center gap-1 text-primary nums">
            <Clock className="w-3.5 h-3.5" /><CountdownTimer deadline={contest.deadline} />
          </p>
        </div>
        <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Entries</p>
          <p className="text-sm font-semibold flex items-center gap-1 nums">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />{entriesCount}
          </p>
        </div>
      </div>

      {children && <div className="space-y-2.5 pt-1">{children}</div>}
    </div>
  );
}