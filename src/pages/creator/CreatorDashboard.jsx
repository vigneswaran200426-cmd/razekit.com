import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Trophy, IndianRupee, Award, Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import ContestCard from '@/components/ContestCard';
import { formatMoney } from '@/lib/campaign-brief';
import OverviewHeader, { greeting } from '@/components/ui/OverviewHeader';
import NextTask from '@/components/ui/NextTask';
import SectionHeader from '@/components/ui/SectionHeader';
import EmptyState from '@/components/ui/EmptyState';
import { creatorNextAction } from '@/lib/workflows';
import { recommendContests } from '@/lib/contest-recommend';
import ActivityFeed from '@/components/activity/ActivityFeed';
import SubmissionTrackerTabs from '@/components/creator/SubmissionTrackerTabs';
import UpcomingDeadlines from '@/components/creator/UpcomingDeadlines';
import MyWinsSection from '@/components/creator/MyWinsSection';
import EarningsSummary from '@/components/creator/EarningsSummary';
import ProfileSummary from '@/components/creator/ProfileSummary';
import SocialSummaryCard from '@/components/creator/SocialSummaryCard';
import GlassCard from '@/components/ui/GlassCard';

const ACTIVE = ['open', 'joined', 'working', 'submitted', 'reviewing'];

/*
  CREATOR OVERVIEW — "What should I do right now?" answered in one glance.
  Greeting + real figures → the single next task → active work and discovery
  in the main column; deadlines, earnings and profile on a quiet rail.
*/
export default function CreatorDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contests, setContests] = useState([]);
  const [subs, setSubs] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [winnerPublishes, setWinnerPublishes] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [socialPosts, setSocialPosts] = useState([]);
  const [profile, setProfile] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    base44.analytics.track({ eventName: 'dashboard_opened', properties: { role: 'creator' } });
    (async () => {
      try {
        const [allContests, mySubs, w, rv, wps, hov, sps, profiles, notes] = await Promise.all([
          base44.entities.Contest.list('-created_date', 100).catch(() => []),
          user?.id ? base44.entities.Submission.filter({ created_by_id: user.id }, '-created_date', 100).catch(() => []) : [],
          user?.id ? base44.entities.Wallet.filter({ user_id: user.id }, '-created_date', 1).catch(() => []) : [],
          user?.id ? base44.entities.Review.filter({ creator_id: user.id, status: 'published' }, '-created_date', 100).catch(() => []) : [],
          user?.id ? base44.entities.WinnerPublish.filter({ creator_id: user.id }, '-created_date', 100).catch(() => []) : [],
          user?.id ? base44.entities.Handover.filter({ winner_id: user.id }, '-created_date', 100).catch(() => []) : [],
          user?.id ? base44.entities.SocialCampaignPost.filter({ creator_id: user.id }, '-updated_date', 100).catch(() => []) : [],
          user?.id ? base44.entities.UserProfile.filter({ user_id: user.id }, '-created_date', 1).catch(() => []) : [],
          user?.id ? base44.entities.Notification.filter({ recipient_user_id: user.id }, '-created_date', 50).catch(() => []) : [],
        ]);
        setContests(allContests);
        setSubs(mySubs);
        setWallet(w?.[0] || null);
        setReviews(rv.filter((r) => (r.reviewer_role || 'client') === 'client'));
        setWinnerPublishes(wps);
        setHandovers(hov);
        setSocialPosts(sps);
        setProfile(profiles?.[0] || null);
        setUnread(notes.filter((n) => !n.read).length);
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  const contestsById = Object.fromEntries(contests.map((c) => [c.id, c]));
  const joinedIds = subs.map((s) => s.contest_id);
  const myContests = contests.filter((c) => joinedIds.includes(c.id));
  const active = myContests.filter((c) => ACTIVE.includes(c.status));
  const wonContests = contests.filter((c) => c.winner_user_id === user?.id && ['winner_selected', 'completed'].includes(c.status));
  const shortlisted = subs.filter((s) => s.status === 'shortlisted').length;
  const earnings = wallet?.available_balance || 0;
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / reviews.length).toFixed(1) : null;
  const recommended = recommendContests({ contests, subs, profile, limit: 4 });

  const creatorActions = myContests
    .map((c) => {
      const a = creatorNextAction(c, subs.find((s) => s.contest_id === c.id), {
        winnerPublish: winnerPublishes.find((w) => w.contest_id === c.id),
        handover: handovers.find((h) => h.contest_id === c.id),
        userId: user?.id,
      });
      return a ? { ...a, contest: c } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || new Date(a.contest.deadline || 0) - new Date(b.contest.deadline || 0));
  const nextAction = creatorActions[0] || null;
  const firstName = (user?.full_name || user?.email?.split('@')[0] || 'Creator').split(' ')[0];

  return (
    <div className="page-shell max-w-3xl lg:max-w-6xl mx-auto pb-10 space-y-8">

      {/* Compact contextual header — greeting + real figures, then content */}
      <OverviewHeader
        title={`${greeting()}, ${firstName}`}
        actions={
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="relative w-9 h-9 rounded-full border border-border/70 bg-white/60 flex items-center justify-center text-muted-foreground hover:text-foreground press transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        }
        stats={[
          { label: 'Active', value: active.length },
          { label: 'Shortlisted', value: shortlisted },
          { label: 'Wins', value: wonContests.length },
          { label: 'Earnings', value: formatMoney(earnings) },
        ]}
      />

      {/* The one current task — no heading needed, the band says it */}
      {nextAction && (
        <NextTask
          icon={nextAction.celebrate ? Trophy : Compass}
          label={nextAction.label}
          context={nextAction.contest.title}
          hint={nextAction.hint}
          to={nextAction.to}
          deadline={ACTIVE.includes(nextAction.contest.status) ? nextAction.contest.deadline : null}
          highlight={!!nextAction.celebrate}
        />
      )}

      {/* Asymmetric composition: main work column + quiet rail */}
      <div className="grid lg:grid-cols-12 gap-x-8 gap-y-8 items-start">

        {/* ── Main column ── */}
        <div className="lg:col-span-8 space-y-8 min-w-0">
          <section>
            <SectionHeader title="Active contests" actionLabel="View all" to="/explore" />
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-4">{[1, 2].map((i) => (
                <div key={i} className="h-72 surface rounded-2xl overflow-hidden">
                  <div className="h-40 bg-secondary/70 animate-pulse" />
                  <div className="p-4 space-y-2.5">
                    <div className="h-4 w-3/4 rounded bg-secondary animate-pulse" />
                    <div className="h-4 w-1/2 rounded bg-secondary animate-pulse" />
                  </div>
                </div>
              ))}</div>
            ) : active.length ? (
              <div className="grid sm:grid-cols-2 gap-4">{active.slice(0, 4).map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
            ) : (
              <EmptyState
                compact
                title="No active contests"
                description="Browse open contests and start your next winning submission."
                actionLabel="Find contests"
                to="/explore"
              />
            )}
          </section>

          <section>
            <SectionHeader title="Submissions" actionLabel="View all" to="/my-contests" />
            <SubmissionTrackerTabs subs={subs} contestsById={contestsById} />
          </section>

          {wonContests.length > 0 && (
            <section>
              <SectionHeader title="My wins" />
              <MyWinsSection contests={wonContests} handovers={handovers} winnerPublishes={winnerPublishes} />
            </section>
          )}

          <section>
            <SectionHeader title="For you" actionLabel="See all" to="/explore" />
            {recommended.length ? (
              <div className="grid sm:grid-cols-2 gap-4">{recommended.map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
            ) : (
              <EmptyState compact title="No open contests right now" description="New contests in your categories will appear here." actionLabel="Explore anyway" to="/explore" />
            )}
          </section>
        </div>

        {/* ── Rail ── */}
        <div className="lg:col-span-4 space-y-8 min-w-0">
          <section>
            <SectionHeader title="Deadlines" />
            <UpcomingDeadlines contests={myContests} subs={subs} handovers={handovers} winnerPublishes={winnerPublishes} />
          </section>

          <section>
            <SectionHeader title="Earnings" />
            <EarningsSummary wallet={wallet} />
          </section>

          <section>
            <SectionHeader title="Profile" />
            <ProfileSummary profile={profile} user={user} rating={avgRating} wins={wonContests.length} />
          </section>

          <section>
            <SectionHeader title="Reputation" />
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Award className="w-4 h-4" /></div>
                <div className="min-w-0">
                  <p className="font-heading text-base font-bold nums">{avgRating ? `${avgRating} rating` : 'No ratings yet'}</p>
                  <p className="text-xs text-muted-foreground">{reviews.length} verified review{reviews.length === 1 ? '' : 's'} · {wonContests.length} win{wonContests.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              {reviews.length ? (
                <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                  {reviews.slice(0, 2).map((r) => <p key={r.id} className="text-xs text-muted-foreground line-clamp-2">“{r.review_text}”</p>)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">Verified brand reviews appear after your first completed contest.</p>
              )}
            </GlassCard>
          </section>

          {socialPosts.length > 0 && (
            <section>
              <SectionHeader title="Social tracker" />
              <SocialSummaryCard posts={socialPosts} />
            </section>
          )}

          <section>
            <SectionHeader title="Activity" />
            <ActivityFeed limit={5} />
          </section>
        </div>
      </div>
    </div>
  );
}