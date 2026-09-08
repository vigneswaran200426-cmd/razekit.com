import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { PUBLISHED_LIKE, SOCIAL_POST_STATE_LABELS, SOCIAL_POST_STATES, campaignTotals, formatMetric, hasMetrics } from '@/lib/social-tracker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';
import PlatformTabs from '@/components/social/PlatformTabs';
import PostTable, { PostCards } from '@/components/social/PostTable';
import PublishDialog from '@/components/social/PublishDialog';
import MetricsDialog from '@/components/social/MetricsDialog';
import AddPostDialog from '@/components/social/AddPostDialog';

const inputCls = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export default function SocialTracker() {
  const { user } = useAuth();
  const [contests, setContests] = useState([]);
  const [posts, setPosts] = useState(null);
  const [winnerPublishes, setWinnerPublishes] = useState([]);
  const [creatorsById, setCreatorsById] = useState({});
  const [platformTab, setPlatformTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [publishPost, setPublishPost] = useState(null);
  const [metricsPost, setMetricsPost] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [cts, ps, wps, stats] = await Promise.all([
      base44.entities.Contest.list('-created_date', 100).then((l) => l.filter((c) => c.created_by_id === user.id)).catch(() => []),
      base44.entities.SocialCampaignPost.filter({ client_id: user.id }, '-updated_date', 200).catch(() => []),
      base44.entities.WinnerPublish.filter({ client_id: user.id }, '-created_date', 100).catch(() => []),
      base44.entities.PublicCreatorStats.list('-updated_date', 200).catch(() => []),
    ]);
    setContests(cts); setPosts(ps); setWinnerPublishes(wps); setCreatorsById(Object.fromEntries(stats.map((s) => [s.user_id, s])));
  }, [user?.id]);

  useEffect(() => { base44.analytics.track({ eventName: 'social_tracker_opened' }); load(); }, [load]);

  const contestsById = Object.fromEntries(contests.map((c) => [c.id, c]));
  const totals = campaignTotals(posts || []);
  const needsAttention = (posts || []).filter((p) => (PUBLISHED_LIKE.includes(p.status) && !hasMetrics(p)) || p.status === 'FAILED').length;
  const filtered = (posts || []).filter((p) => {
    if (platformTab !== 'all' && p.platform !== platformTab) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [p.title, p.live_url, p.caption, contestsById[p.contest_id]?.title].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="page-shell pb-10">
      <div className="max-w-6xl mx-auto space-y-5">
        <PageHeader icon={Activity} title="Social tracker" subtitle="A focused view of RazeKit posts and performance; core contest work stays on the dashboard." actions={<Button onClick={() => setAddOpen(true)} className="rz-primary-action gap-1.5 rounded-lg"><Plus className="w-4 h-4" /> Add post</Button>} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="surface p-4"><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Published</p><p className="font-heading text-2xl font-bold mt-1 nums">{totals.publishedCount}</p></div>
          <div className="surface p-4"><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Platforms</p><p className="font-heading text-2xl font-bold mt-1 nums">{totals.platformsActive}</p></div>
          <div className="surface p-4"><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Tracked views</p><p className="font-heading text-2xl font-bold mt-1 nums">{totals.anyViewsTracked ? formatMetric(totals.totals.views) : <span className="text-sm text-muted-foreground font-medium">Not tracked</span>}</p></div>
          <div className={`surface p-4 ${needsAttention ? 'border-amber-300' : ''}`}><p className="text-[11px] uppercase tracking-widest text-muted-foreground">Needs attention</p><p className="font-heading text-2xl font-bold mt-1 nums">{needsAttention}</p></div>
        </div>

        <section className="surface p-3 md:p-4 space-y-3">
          <PlatformTabs posts={posts || []} active={platformTab} onChange={setPlatformTab} />
          <div className="flex flex-col sm:flex-row gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search posts, contests or URLs…" className="pl-9" aria-label="Search social posts" /></div><select className={`${inputCls} sm:w-52`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by social post status"><option value="all">All statuses</option>{SOCIAL_POST_STATES.map((s) => <option key={s} value={s}>{SOCIAL_POST_STATE_LABELS[s]}</option>)}</select></div>
        </section>

        {posts === null ? <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 surface animate-pulse" />)}</div> : filtered.length ? <><div className="hidden md:block"><PostTable posts={filtered} contestsById={contestsById} creatorsById={creatorsById} onPublish={setPublishPost} onMetrics={setMetricsPost} /></div><div className="md:hidden"><PostCards posts={filtered} contestsById={contestsById} creatorsById={creatorsById} onPublish={setPublishPost} onMetrics={setMetricsPost} /></div></> : <AlertState type={posts.length ? 'not-found' : 'empty'} shape={posts.length ? 'ring' : 'blob'} title={posts.length ? 'No posts match these filters' : 'No social posts yet'} description={posts.length ? 'Clear the search or switch platform/status.' : 'Publish RazeKit work to a connected destination, then track the resulting post here.'} action={posts.length ? undefined : { label: 'Add your first post', onClick: () => setAddOpen(true) }} />}

        <AddPostDialog open={addOpen} onClose={() => setAddOpen(false)} contests={contests} winnerPublishes={winnerPublishes} onCreated={load} />
        <PublishDialog key={publishPost?.id || 'none'} post={publishPost} onClose={() => setPublishPost(null)} onSaved={load} />
        <MetricsDialog post={metricsPost} onClose={() => setMetricsPost(null)} onSaved={load} />
      </div>
    </div>
  );
}
