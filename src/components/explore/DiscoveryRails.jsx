import ContestCard from '@/components/ContestCard';

// Discovery rails — real-data-only horizontal sections (Whop-style marketplace
// energy, reference-deck rhythm). Rendered only when live contests qualify.
function Rail({ title, hint, contests, hiddenCount }) {
  if (contests.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="font-heading text-base font-bold tracking-tight">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1 -mx-1 px-1">
        {contests.map((c, i) => (
          <div key={c.id} className="w-[270px] sm:w-[290px] shrink-0 snap-start">
            <ContestCard contest={c} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DiscoveryRails({ contests }) {
  if (!contests.length) return null;

  const WEEK_MS = 7 * 24 * 3600000;
  const closingSoon = contests
    .filter((c) => {
      const left = new Date(c.deadline).getTime() - Date.now();
      return left > 0 && left <= WEEK_MS;
    })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 8);

  const topPrizes = [...contests]
    .sort((a, b) => (b.prize_amount || 0) - (a.prize_amount || 0))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <Rail title="Closing soon" hint="Ends within a week" contests={closingSoon} />
      <Rail title="Top prizes" hint="Highest rewards live now" contests={topPrizes} />
    </div>
  );
}