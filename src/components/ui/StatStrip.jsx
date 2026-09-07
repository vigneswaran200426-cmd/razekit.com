import { cn } from '@/lib/utils';

/*
  Contextual stat cluster — quiet typographic figures with hierarchy,
  not a card or a row of equal-weight widgets. Values must be real data;
  render nothing by omitting the stat. Mobile scrolls horizontally.
*/
export default function StatStrip({ stats, className }) {
  if (!stats?.length) return null;
  return (
    <div className={cn('flex items-start gap-6 md:gap-9 overflow-x-auto scrollbar-hide', className)}>
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col shrink-0">
          <p className="font-heading text-lg md:text-xl font-bold nums leading-none">{s.value}</p>
          <p className="text-[11px] text-muted-foreground font-medium mt-1">{s.label}</p>
        </div>
      ))}
    </div>
  );
}