// DISCOVER — creator-oriented opportunity marketplace (spec 6).
// Explore is brand-oriented discovery of talent and work; Discover is the
// creator's view of contests worth entering.
import { useEffect, useMemo, useState } from 'react';
import { Compass, SlidersHorizontal } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader, Card, Input, Segmented, EmptyState, Skeleton, Badge } from '@/components/ui';
import ContestCard from '@/components/ContestCard';

const CATEGORIES = ['All', 'Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Wedding', 'Documentary', 'Corporate', 'Travel', 'Music Video'];

const SORTS = [
  { key: 'ending', label: 'Ending soon' },
  { key: 'prize', label: 'Highest prize' },
  { key: 'newest', label: 'Newest' },
];

export default function Discover() {
  const { user } = useAuth();
  const [contests, setContests] = useState(null);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [sort, setSort] = useState('ending');

  useEffect(() => {
    entities.Contest.filter({ status: 'open' }, '-created_date', 200).then(setContests).catch(() => setContests([]));
  }, []);

  // Which contests has this creator already entered? Drives the participation badge.
  useEffect(() => {
    if (!user?.id) return;
    entities.Submission.filter({ created_by_id: user.id }, '-created_date', 200)
      .then((s) => setMine((s || []).map((x) => x.contest_id)))
      .catch(() => {});
  }, [user?.id]);

  const shown = useMemo(() => {
    let list = [...(contests || [])];
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((c) => `${c.title} ${c.short_description || ''} ${c.category || ''}`.toLowerCase().includes(term));
    if (cat !== 'All') list = list.filter((c) => c.category === cat);
    if (sort === 'prize') list.sort((a, b) => Number(b.prize_amount || 0) - Number(a.prize_amount || 0));
    else if (sort === 'newest') list.sort((a, b) => Date.parse(b.created_date || 0) - Date.parse(a.created_date || 0));
    else list.sort((a, b) => (Date.parse(a.deadline || 0) || Infinity) - (Date.parse(b.deadline || 0) || Infinity));
    return list;
  }, [contests, q, cat, sort]);

  const entered = new Set(mine);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Discover"
        title="Contests worth entering"
        description="Open, prize-funded briefs from real brands. Every contest runs on a fair, prize-based timeline."
      />

      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search briefs, categories, brands…"
            aria-label="Search contests"
            className="flex-1"
          />
          <Segmented value={sort} onChange={setSort} tabs={SORTS} size="sm" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <SlidersHorizontal className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                cat === c ? 'border-primary bg-primary text-primary-ink' : 'border-line text-muted hover:text-ink hover:border-line-strong'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      {contests === null ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={q.trim() || cat !== 'All' ? 'No matching contests' : 'No open contests right now'}
          description={q.trim() || cat !== 'All' ? 'Try a different search or category.' : 'New prize-funded briefs land here — check back soon.'}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((c) => (
            <div key={c.id} className="relative">
              {entered.has(c.id) && (
                <div className="absolute right-3 top-3 z-10"><Badge tone="success">Entered</Badge></div>
              )}
              <ContestCard contest={c} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
