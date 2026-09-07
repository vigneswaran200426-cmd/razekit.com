import { cn } from '@/lib/utils';
import StatStrip from '@/components/ui/StatStrip';

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/*
  Compact editorial dashboard header — a greeting and real numbers, then content.
  No eyebrow, no tagline, no giant title. Stats render as quiet typographic
  figures with hierarchy (value large, label small), never an equal-weight widget row.
*/
export default function OverviewHeader({ title, actions, stats, className }) {
  return (
    <header className={cn('rz-reveal', className)}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-xl md:text-2xl font-bold tracking-tight truncate">{title}</h1>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {stats?.length ? <StatStrip stats={stats} className="mt-4" /> : null}
    </header>
  );
}