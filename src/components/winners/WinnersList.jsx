import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Search, Award, CheckCircle2, LayoutGrid, RefreshCw, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile } from '@/lib/username-utils';
import { fadeUp } from '@/lib/motion';
import { WP_STATUS } from '@/lib/winner-publish';
import WinnerCard from './WinnerCard';
import WinnerDetailModal from './WinnerDetailModal';
import PublishedWinnerCard from '@/components/winner/PublishedWinnerCard';
import FeaturedWinner from '@/components/winner/FeaturedWinner';

// Full Winners Hub experience — hero + featured published winner + premium
// published grid + verified winner archive + filters/sort/search.
export default function WinnersList() {
  const [published, setPublished] = useState(null); // WinnerPublish[] (status published)
  const [profiles, setProfiles] = useState({});
  const [archive, setArchive] = useState([]); // [{contest, winner, client}]
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All winners');
  const [sort, setSort] = useState('latest');
  const [detail, setDetail] = useState(null);

  const load = async () => {
    setError(false); setPublished(null); setArchive([]);
    try {
      const [pubs, all] = await Promise.all([
        base44.entities.WinnerPublish.list('-published_at', 60).catch(() => []),
        base44.entities.Contest.list('-created_date', 300),
      ]);
      const live = (pubs || []).filter((p) => p.status === WP_STATUS.PUBLISHED);
      setPublished(live);

      const finalized = all.filter((c) => c.winner_user_id && ['winner_selected', 'completed'].includes(c.status) && !c.private_contest);
      const publishedContestIds = new Set(live.map((p) => p.contest_id));
      const archived = finalized.filter((c) => !publishedContestIds.has(c.id));

      const uids = [...new Set([
        ...live.flatMap((p) => [p.creator_id, p.client_id]),
        ...archived.flatMap((c) => [c.winner_user_id, c.created_by_id]),
      ].filter(Boolean))];
      const p = {};
      await Promise.all(uids.map(async (id) => { p[id] = await getUserProfile(id).catch(() => null); }));
      setProfiles(p);
      setArchive(archived.map((c) => ({ contest: c, winner: p[c.winner_user_id], client: p[c.created_by_id] })));
    } catch { setError(true); }
  };
  useEffect(() => { load(); }, []);

  const pubItems = useMemo(() => (published || []).map((p) => ({
    publish: p,
    creator: profiles[p.creator_id],
    client: profiles[p.client_id],
  })), [published, profiles]);

  const categories = useMemo(() => (published ? ['All winners', ...[...new Set(published.map((p) => p.category).filter(Boolean))]] : ['All winners']), [published]);
  const stats = useMemo(() => ({
    showcase: published?.length || 0,
    winners: new Set([...pubItems.map((i) => i.publish.creator_id), ...archive.map((i) => i.contest.winner_user_id)]).size,
    cats: new Set([...pubItems.map((i) => i.publish.category), ...archive.map((i) => i.contest.category)].filter(Boolean)).size,
  }), [published, pubItems, archive]);

  const filtered = useMemo(() => {
    if (!published) return [];
    let r = cat === 'All winners' ? pubItems : pubItems.filter((i) => i.publish.category === cat);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((i) => [
        i.publish.title, i.publish.category,
        i.creator?.display_name, i.creator?.username,
        i.client?.company_name, i.client?.display_name,
      ].some((v) => (v || '').toLowerCase().includes(t)));
    }
    return [...r].sort((a, b) => (sort === 'prize'
      ? (b.publish.prize_amount || 0) - (a.publish.prize_amount || 0)
      : new Date(b.publish.published_at || 0) - new Date(a.publish.published_at || 0)));
  }, [pubItems, published, cat, q, sort]);

  const featured = filtered.length ? filtered[0] : null;
  const rest = filtered.slice(1);

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4 pb-10">
      {/* Hero */}
      <motion.div {...fadeUp()} className="relative overflow-hidden rounded-3xl glass-card p-6 md:p-8 mb-5">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-block text-[11px] font-semibold tracking-widest text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">REAL TALENT. REAL RESULTS.</span>
          <h1 className="font-heading text-2xl md:text-3xl font-extrabold tracking-tight">Winners <span className="text-primary">Hub</span></h1>
          <p className="text-base text-foreground/80 mt-2">The showcase of winning creative from real Razekit contests.</p>
          <p className="text-sm text-muted-foreground mt-1">Every entry here was selected, approved and published through a verified contest.</p>
          <div className="grid grid-cols-3 gap-3 mt-6 max-w-lg">
            <StatCard icon={Sparkles} value={stats.showcase} label="Published Winners" />
            <StatCard icon={Award} value={stats.winners} label="Winners Celebrated" />
            <StatCard icon={LayoutGrid} value={stats.cats} label="Categories" />
          </div>
        </div>
        <Trophy className="hidden lg:block absolute right-10 top-1/2 -translate-y-1/2 w-44 h-44 text-primary/15" />
      </motion.div>

      {/* Filters + sort + search (published showcase) */}
      {published !== null && published.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${cat === c ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search winners..." aria-label="Search winners"
                className="h-9 pl-9 pr-3 rounded-full bg-card border border-border text-sm w-40 focus:w-52 transition-all focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort winners" className="h-9 px-3 rounded-full bg-card border border-border text-sm text-foreground focus:outline-none">
              <option value="latest">Newest</option>
              <option value="prize">Top prize</option>
            </select>
          </div>
        </div>
      )}

      {/* Body */}
      {published === null ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-72 glass-card rounded-2xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="font-heading font-bold mb-1">Couldn't load winners</p>
          <p className="text-sm text-muted-foreground mb-4">Something went wrong while loading the Winners Hub.</p>
          <button onClick={load} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold"><RefreshCw className="w-4 h-4" /> Try again</button>
        </div>
      ) : (
        <>
          {/* Published showcase */}
          {featured ? (
            <>
              <FeaturedWinner publish={featured.publish} creator={featured.creator} client={featured.client} />
              {rest.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                  {rest.map((it, i) => <PublishedWinnerCard key={it.publish.id} publish={it.publish} creator={it.creator} client={it.client} index={i} />)}
                </div>
              )}
              {filtered.length === 1 && rest.length === 0 && (
                <p className="text-sm text-muted-foreground text-center mb-8">More winning work publishes here as contests complete their showcase.</p>
              )}
            </>
          ) : (
            <div className="glass-card rounded-2xl p-10 text-center mb-8">
              <Sparkles className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-heading font-bold mb-1">{published.length ? 'No published winners match your filters' : 'The showcase is warming up'}</p>
              <p className="text-sm text-muted-foreground">{published.length ? 'Try a different category or search.' : 'Winning work appears here once the brand approves it for the Winners Hub.'}</p>
            </div>
          )}

          {/* Winner archive — finalized contests not yet published */}
          {archive.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Winner archive</h2>
                <span className="text-xs text-muted-foreground">Verified contest results</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {archive.map((it, i) => <WinnerCard key={it.contest.id} contest={it.contest} winner={it.winner} client={it.client} index={i} onOpen={() => setDetail(it)} />)}
              </div>
            </div>
          )}
        </>
      )}

      {detail && <WinnerDetailModal item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StatCard({ icon: Icon, value, label }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></div>
      <div>
        <p className="font-heading text-xl font-bold leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}