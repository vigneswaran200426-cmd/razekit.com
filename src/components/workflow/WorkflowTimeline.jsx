import { Check, Circle, CircleDot, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS = { done: Check, current: CircleDot, pending: Circle, skipped: Minus };
const STYLES = {
  done: 'bg-success/10 text-success border-success/30',
  current: 'bg-primary text-primary-foreground border-primary shadow-primary-glow',
  pending: 'bg-secondary text-muted-foreground border-border',
  skipped: 'bg-secondary/50 text-muted-foreground/40 border-border/50',
};

// Compact horizontal lifecycle strip driven by deriveContestWorkflow() (WORKFLOWS §16).
export default function WorkflowTimeline({ stages, className }) {
  if (!stages?.length) return null;
  return (
    <div className={cn('overflow-x-auto scrollbar-hide', className)}>
      <div className="flex items-start min-w-max px-1 py-1">
        {stages.map((st, i) => {
          const Icon = ICONS[st.status] || Circle;
          return (
            <div key={st.id} className="flex items-start">
              <div className="flex flex-col items-center gap-1.5 w-[86px]">
                <span className={cn('w-6 h-6 rounded-full border flex items-center justify-center shrink-0', STYLES[st.status])}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className={cn('text-[10px] font-medium text-center leading-tight', st.status === 'current' ? 'text-primary' : st.status === 'skipped' ? 'text-muted-foreground/40' : 'text-muted-foreground')}>
                  {st.label}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div className={cn('h-0.5 w-4 mt-[11px] -ml-1 -mr-1 rounded', stages[i + 1].status === 'skipped' ? 'bg-border/50' : 'bg-border')} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}