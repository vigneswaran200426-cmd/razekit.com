import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trophy, FileVideo, CheckCircle2, ArrowRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import OverviewHeader, { greeting } from '@/components/ui/OverviewHeader';
import NextTask from '@/components/ui/NextTask';
import SectionHeader from '@/components/ui/SectionHeader';
import EmptyState from '@/components/ui/EmptyState';
import ContestCard from '@/components/ContestCard';
import { brandNextAction } from '@/lib/workflows';
import NeedsAttention from '@/components/brand/NeedsAttention';
import WinnerContentBoard from '@/components/brand/WinnerContentBoard';
import PostWinWork from '@/components/brand/PostWinWork';
import SocialTrackingSummary from '@/components/brand/SocialTrackingSummary';

const ACTIVE = ['open', 'joined', 'working', 'submitted', 'reviewing'];

export default function ClientDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contests, setContests] = useState([]);
  const [subs, setSubs] = useState([]);
  const [winnerPublishes, setWinnerPublishes] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    base44.analytics.track({ eventName: 'dashboard_opened', properties: { role: 'brand' } });
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const [cts, allSubs, wps, hov, ps, conns] = await Promise.all([
          base44.entities.Contest.list('-created_date', 200).then((l) => l.filter((c) => c.created_by_id === user.id)).catch(() => []),
          base44.entities.Submission.filter({ client_id: user.id }, '-created_date', 200).catch(() => []),
          base44.entities.WinnerPublish.filter({ client_id: user.id }, '-created_date', 100).catch(() => []),
          base44.entities.Handover.filter({ client_id: user.id }, '-created_date', 100).catch(() => []),
          base44.entities.SocialCampaignPost.filter({ client_id: user.id }, '-updated_date', 200).catch(() => []),
          base44.entities.SocialConnection.filter({ owner_user_id: user.id }, '-updated_date', 50).then((l) => l.filter((c) => c.owner_type === 'client')).catch(() => []),
        ]);
        setContests(cts);
        setSubs(allSubs);
        setWinnerPublishes(wps);
        setHandovers(hov);
        setPosts(ps);
        setConnections(conns);
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  const contestsById = Object.fromEntries(contests.map((c) => [c.id, c]));
  const subCount = (cid) => subs.filter((s) => s.contest_id === cid).length;
  const actions = contests
    .map((c) => {
      const a = brandNextAction(c, {
        winnerPublish: winnerPublishes.find((w) => w.contest_id === c.id),
        handover: handovers.find((h) => h.contest_id === c.id),
        submissionsCount: subCount(c.id),
      });
      return a ? { ...a, contest: c } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  const nextAction = actions[0] || null;
  const active = contests.filter((c) => ACTIVE.includes(c.status));
  const reviewQueue = subs.filter((s) => ['ready_to_review', 'submitted'].includes(s.status)).slice(0, 6);
  const toReview = subs.filter((s) => ['ready_to_review', 'submitted'].includes(s.status)).length;
  const prizePool = active.reduce((sum, c) => sum + (c.prize_amount || 0), 0);
  const firstName = (user?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0];
  const actionIcon = (a) => (a.to?.endsWith('/review') ? Trophy : a.to?.includes('/winner') || a.to?.includes('/handover') || a.to === '/social' ? CheckCircle2 : FileVideo);

  return (
    <div className="page-shell pb-10">
      <div className="space-y-5">
        <OverviewHeader
          title={`${greeting()}, ${firstName}`}
          actions={<Link to="/create-contest" className="rz-primary-action inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"><Plus className="w-4 h-4" /> Create contest</Link>}
          stats={[
            { label: 'Active', value: active.length },
            { label: 'Needs review', value: toReview },
            { label: 'Prize pool', value: `₹${prizePool.toLocaleString('en-IN')}` },
          ]}
        />

        {nextAction && <NextTask icon={actionIcon(nextAction)} label={nextAction.label} context={nextAction.contest.title} hint={nextAction.hint} to={nextAction.to} deadline={ACTIVE.includes(nextAction.contest.status) ? nextAction.contest.deadline : null} />}

        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-6 min-w-0">
            <section>
              <SectionHeader title="Active contests" actionLabel="View all" to="/my-contests" />
              {loading ? (
                <div className="grid sm:grid-cols-2 gap-4">{[1, 2, 3].map((i) => <div key={i} className="surface overflow-hidden"><div className="aspect-[16/10] bg-secondary/70 animate-pulse" /><div className="p-4 space-y-2.5"><div className="h-4 w-3/4 rounded bg-secondary animate-pulse" /><div className="h-4 w-1/2 rounded bg-secondary animate-pulse" /></div></div>)}</div>
              ) : active.length ? (
                <div className="grid sm:grid-cols-2 gap-4">{active.map((c, i) => <ContestCard key={c.id} contest={c} index={i} submissionsCount={subCount(c.id)} />)}</div>
              ) : <EmptyState compact title="No active contests" description="Launch your first contest and let creators compete for your prize." actionLabel="Create contest" to="/create-contest" />}
            </section>

            {reviewQueue.length > 0 && <section>
              <SectionHeader title="Review queue" actionLabel={toReview > 6 ? `View all ${toReview}` : undefined} />
              <div className="surface divide-y divide-border/60 overflow-hidden">
                {reviewQueue.map((s) => (
                  <Link key={s.id} to={`/contest/${s.contest_id}/review`} className="group flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileVideo className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{contestsById[s.contest_id]?.title || 'Contest entry'}</p><p className="text-xs text-muted-foreground mt-0.5 nums">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-IN') : 'Awaiting final files'}</p></div>
                    <span className="flex items-center gap-1 text-xs font-semibold text-primary shrink-0">Review <ArrowRight className="w-3 h-3" /></span>
                  </Link>
                ))}
              </div>
            </section>}
          </div>

          <div className="lg:col-span-4 space-y-6 min-w-0">
            <section><SectionHeader title="Needs attention" /><NeedsAttention contests={contests} subs={subs} winnerPublishes={winnerPublishes} handovers={handovers} connections={connections} /></section>
            <section><SectionHeader title="Winner content" /><WinnerContentBoard winnerPublishes={winnerPublishes} contests={contests} /></section>
            <section><SectionHeader title="Post-win work" /><PostWinWork handovers={handovers} contests={contests} winnerPublishes={winnerPublishes} /></section>
            {posts.length > 0 && <section><SectionHeader title="Social tracking" actionLabel="View all" to="/social" /><SocialTrackingSummary posts={posts} /></section>}
          </div>
        </div>
      </div>
    </div>
  );
}
