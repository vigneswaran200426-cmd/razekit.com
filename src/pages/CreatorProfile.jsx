// Public member profile (/u/:id) — read-only presentation of facts that are
// already public.
//
// One route serves two kinds of member, because a brand and a creator are the
// same account type with different evidence behind them: a creator profile is
// identity + portfolio + wins + measured performance + history, a client
// profile is identity + campaigns + completed collaborations. What this screen
// deliberately does NOT show is anybody's money: a member's earnings, balance
// and payouts are private to them, so only a contest's own published prize
// appears here, labelled as the prize and never as a payout.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Star, Trophy, Grid3x3, MessageSquare, BadgeCheck, Play, BarChart3,
  Megaphone, Handshake, AlertCircle, RotateCcw, Globe, Lock, ImageOff,
} from 'lucide-react';
import { entities, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, dateShort } from '@/lib/format';
import {
  Card, Button, Badge, Avatar, Segmented, EmptyState, Skeleton, Metric, Timeline,
} from '@/components/ui';
import { cn } from '@/lib/cn';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const isVideo = (url = '') => VIDEO_EXT.test(url);
const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** Star rating, read as a single value by assistive tech. */
function Stars({ value = 0, className }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cn('h-4 w-4', className, n <= value ? 'fill-warning text-warning' : 'text-line-strong')} />
      ))}
    </span>
  );
}

/** One headline number in the identity header. A missing count is not a zero. */
function HeroStat({ label, value, sub }) {
  const missing = value === null || value === undefined;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('mt-0.5 font-display font-extrabold tracking-tight text-ink nums', missing ? 'text-[13px] text-muted' : 'text-xl')}>
        {missing ? 'Not measured' : value}
        {!missing && sub && <span className="ml-1.5 text-[12px] font-medium text-muted">{sub}</span>}
      </p>
    </div>
  );
}

function SectionError({ title, onRetry }) {
  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description="Nothing has been removed — this section simply did not load."
      action={onRetry && <Button variant="secondary" onClick={onRetry}><RotateCcw className="h-4 w-4" aria-hidden="true" />Try again</Button>}
    />
  );
}

/** Loading shape mirrors the real page: hero, tabs, then a media grid. */
function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy="true">
      <Card className="overflow-hidden">
        <Skeleton className="h-24 w-full rounded-none sm:h-32" />
        <div className="px-4 pb-6 sm:px-6">
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
            <Skeleton className="h-[88px] w-[88px] rounded-full ring-4 ring-surface" />
            <div className="flex-1 space-y-2 sm:pb-1">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-11 w-full sm:w-32" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full max-w-2xl" />
            <Skeleton className="h-3.5 w-2/3 max-w-md" />
          </div>
          <div className="mt-5 flex flex-wrap gap-6 border-t border-line pt-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-24" />)}
          </div>
        </div>
      </Card>
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
      </div>
    </div>
  );
}

/* ── Portfolio ──────────────────────────────────────────────────────────── */

/**
 * One portfolio piece.
 *
 * A grid of forty autoplaying, preloading videos is how a phone profile
 * becomes unusable, so nothing is fetched until it is asked for: video tiles
 * stay a poster-less panel until pressed, and the parent allows one at a time.
 */
function PortfolioItem({ post, active, onActivate }) {
  const video = isVideo(post.media_url);
  const title = post.title || post.caption || 'Untitled work';
  return (
    <figure className="group min-w-0">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-ink">
        {video ? (
          active ? (
            <video
              src={post.media_url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              aria-label={title}
              className="absolute inset-0 h-full w-full object-contain bg-ink"
            />
          ) : (
            <button
              type="button"
              onClick={onActivate}
              aria-label={`Play ${title}`}
              className="absolute inset-0 h-full w-full bg-gradient-to-br from-ink to-[#101a2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            >
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 shadow-md transition-transform duration-200 ease-brand motion-safe:group-hover:scale-105">
                  <Play className="h-5 w-5 translate-x-0.5 fill-ink text-ink" aria-hidden="true" />
                </span>
              </span>
              <span className="absolute bottom-2 left-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">Video</span>
            </button>
          )
        ) : (
          <img
            src={post.media_url}
            alt={title}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>
      <figcaption className="mt-1.5 min-w-0">
        <Link
          to="/feed"
          className="block truncate rounded text-[12px] font-medium text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {title}
        </Link>
      </figcaption>
    </figure>
  );
}

/* ── Result cards ───────────────────────────────────────────────────────── */

/**
 * A contest this member won or ran.
 *
 * The cover is the CAMPAIGN's image and is labelled as nothing else — the
 * winning entry itself lives in the Winners hub, and is never stood in for
 * here.
 */
function ContestTile({ c, badge, footer }) {
  return (
    <Card as="article" className="flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {c.cover_image_url ? (
          <img src={c.cover_image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-muted" aria-hidden="true"><ImageOff className="h-5 w-5" /></span>
        )}
        {badge}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="font-display text-sm font-bold leading-snug text-ink">
          <Link
            to={`/contest/${c.id}`}
            className="line-clamp-2 rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {c.title || 'Contest'}
          </Link>
        </h3>
        {footer}
      </div>
    </Card>
  );
}

const PrizeLine = ({ c }) => (
  <div>
    <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Contest prize</p>
    <p className="font-display text-lg font-extrabold text-primary nums">{money(c.prize_amount, c.currency)}</p>
  </div>
);

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function CreatorProfile() {
  const { id } = useParams();
  const { user } = useAuth();

  const [profile, setProfile] = useState(undefined);
  const [profileErr, setProfileErr] = useState(false);
  // The User entity is not readable across accounts, so measured performance
  // comes from a minimal public endpoint (no email, no role, no account state).
  const [publicProfile, setPublicProfile] = useState(undefined);
  const [posts, setPosts] = useState(null);
  const [postsErr, setPostsErr] = useState(false);
  const [wins, setWins] = useState(null);
  const [winsErr, setWinsErr] = useState(false);
  const [campaigns, setCampaigns] = useState(undefined);
  const [reviews, setReviews] = useState(null);
  const [reviewsErr, setReviewsErr] = useState(false);
  const [tab, setTab] = useState(null);
  const [playing, setPlaying] = useState(null);

  const loadIdentity = useCallback(() => {
    setProfile(undefined); setProfileErr(false);
    entities.UserProfile.filter({ user_id: id }, '-created_date', 1)
      .then((l) => setProfile((l || [])[0] || null))
      .catch(() => { setProfile(null); setProfileErr(true); });
  }, [id]);

  const loadPosts = useCallback(() => {
    setPosts(null); setPostsErr(false);
    entities.Post.filter({ author_id: id }, '-created_date', 60)
      .then((l) => setPosts((l || []).filter((p) => p.media_url)))
      .catch(() => { setPosts([]); setPostsErr(true); });
  }, [id]);

  const loadWins = useCallback(() => {
    setWins(null); setWinsErr(false);
    Promise.all([
      entities.Contest.filter({ winner_user_id: id, status: 'completed' }, '-created_date', 60).catch(() => null),
      entities.Contest.filter({ winner_user_id: id, status: 'winner_selected' }, '-created_date', 60).catch(() => null),
    ]).then(([a, b]) => {
      if (a === null && b === null) { setWins([]); setWinsErr(true); return; }
      setWins([...(a || []), ...(b || [])]);
    });
  }, [id]);

  const loadReviews = useCallback(() => {
    setReviews(null); setReviewsErr(false);
    entities.Review.filter({ creator_id: id, status: 'published' }, '-created_date', 60)
      .then((l) => setReviews(l || []))
      .catch(() => { setReviews([]); setReviewsErr(true); });
  }, [id]);

  useEffect(() => {
    setTab(null); setPlaying(null);
    loadIdentity(); loadPosts(); loadWins(); loadReviews();
    fn('creatorPublicProfile', { creator_id: id }).then(setPublicProfile).catch(() => setPublicProfile(null));
    // Contests are created by clients only, so authorship is what distinguishes
    // a brand account from a creator account without reading the User record.
    entities.Contest.filter({ created_by_id: id }, '-created_date', 60)
      .then((l) => setCampaigns(l || []))
      .catch(() => setCampaigns([]));
  }, [id, loadIdentity, loadPosts, loadWins, loadReviews]);

  const rating = useMemo(() => {
    const list = reviews || [];
    const rated = list.filter((r) => num(r.overall_rating));
    return rated.length ? Number((rated.reduce((s, r) => s + r.overall_rating, 0) / rated.length).toFixed(1)) : null;
  }, [reviews]);

  const isMe = user?.id === id;
  const skills = useMemo(() => {
    try { return Array.isArray(profile?.skills) ? profile.skills : JSON.parse(profile?.skills || '[]'); } catch { return []; }
  }, [profile]);

  // Both the identity record and the authorship check decide which profile this
  // is, so the page is not rendered as one kind and then re-rendered as another.
  if (profile === undefined || campaigns === undefined) return <ProfileSkeleton />;

  const isBrand = Boolean(profile?.company_name || profile?.industry || profile?.business_description)
    || (campaigns || []).length > 0;

  const name = profile?.display_name
    || profile?.company_name
    || profile?.username
    || (publicProfile && publicProfile.name)
    || (isBrand ? 'Brand' : 'Creator');

  const completed = (campaigns || []).filter((c) => ['completed', 'winner_selected'].includes(c.status));
  const running = (campaigns || []).filter((c) => !['completed', 'winner_selected', 'draft'].includes(c.status));

  const tabs = isBrand
    ? [
      { key: 'campaigns', label: 'Campaigns', count: (campaigns || []).length },
      { key: 'collaborations', label: 'Collaborations', count: completed.length },
    ]
    : [
      { key: 'portfolio', label: 'Portfolio', count: posts?.length },
      { key: 'wins', label: 'Wins', count: wins?.length },
      { key: 'performance', label: 'Performance' },
      { key: 'reviews', label: 'Reviews', count: reviews?.length },
    ];
  const view = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  const perf = publicProfile || null;
  const perfState = publicProfile === undefined ? 'loading' : publicProfile === null ? 'error' : 'ready';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {profileErr && (
        <p role="alert" className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger">
          We couldn’t load this profile’s details right now. Some information may be missing.
        </p>
      )}

      {/* Identity */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/15 via-surface-2 to-accent/10 sm:h-28" aria-hidden="true" />
        <div className="px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-fit rounded-full shadow-xs ring-4 ring-surface">
              <Avatar name={name} src={profile?.avatar_url} size={88} />
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{name}</h1>
                {profile?.username && <BadgeCheck className="h-5 w-5 shrink-0 text-primary" role="img" aria-label="Claimed username" />}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">
                {isBrand
                  ? (profile?.industry || 'Brand on RazeKit')
                  : (profile?.professional_title || (profile?.username ? `@${profile.username}` : 'Creator on RazeKit'))}
              </p>
            </div>
            <div className="shrink-0 sm:pb-1">
              {isMe
                ? <Button to="/profile" variant="secondary" className="w-full sm:w-auto">Edit profile</Button>
                : <Button to="/help" variant="secondary" className="w-full sm:w-auto"><MessageSquare className="h-4 w-4" aria-hidden="true" />Contact via RazeKit</Button>}
            </div>
          </div>

          {(profile?.bio || profile?.business_description) && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/90">{profile.bio || profile.business_description}</p>
          )}

          {profile?.website && profile?.show_website !== false && (
            <a
              href={/^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />{profile.website}
            </a>
          )}

          <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-4 border-t border-line pt-4">
            {isBrand ? (
              <>
                <HeroStat label="Campaigns" value={(campaigns || []).length} />
                <HeroStat label="Running now" value={running.length} />
                <HeroStat label="Completed" value={completed.length} />
              </>
            ) : (
              <>
                <HeroStat label="Wins" value={wins === null ? null : wins.length} />
                <HeroStat label="Rating" value={rating} sub={reviews?.length ? `(${reviews.length})` : null} />
                <HeroStat label="Portfolio" value={posts === null ? null : posts.length} />
              </>
            )}
          </div>

          {skills.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {skills.slice(0, 5).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
              {skills.length > 5 && <span className="text-[11px] text-muted nums">+{skills.length - 5} more</span>}
            </div>
          )}

          {isMe && (
            <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-snug text-muted">
              <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              This is your public profile. Your earnings, balance and payouts are never shown here —
              they stay in <Link to="/balance" className="font-semibold text-primary hover:underline">Balance</Link>.
            </p>
          )}
        </div>
      </Card>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented
          value={view}
          onChange={setTab}
          tabs={tabs.map((t) => ({
            key: t.key,
            label: t.count === undefined || t.count === null
              ? t.label
              : <>{t.label}<span className="ml-1.5 font-normal opacity-60 nums">{t.count}</span></>,
          }))}
        />
      </div>

      {/* ── Creator: portfolio ── */}
      {view === 'portfolio' && (
        <section aria-labelledby="portfolio-heading" className="space-y-3">
          <h2 id="portfolio-heading" className="sr-only">Portfolio</h2>
          {posts === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
            </div>
          ) : postsErr ? (
            <SectionError title="Portfolio could not be loaded" onRetry={loadPosts} />
          ) : posts.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {posts.map((p) => (
                <li key={p.id} className="min-w-0">
                  <PortfolioItem post={p} active={playing === p.id} onActivate={() => setPlaying(p.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Grid3x3}
              title="No portfolio work yet"
              description={isMe ? 'Share work on the feed to build your portfolio.' : 'This creator hasn’t posted work yet.'}
              action={isMe ? <Button to="/feed">Share work</Button> : undefined}
            />
          )}
        </section>
      )}

      {/* ── Creator: wins ── */}
      {view === 'wins' && (
        <section aria-labelledby="wins-heading" className="space-y-3">
          <h2 id="wins-heading" className="sr-only">Wins</h2>
          {wins === null ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
            </div>
          ) : winsErr ? (
            <SectionError title="Wins could not be loaded" onRetry={loadWins} />
          ) : wins.length ? (
            <>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {wins.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <ContestTile
                      c={c}
                      badge={<Badge tone="success" className="absolute left-2.5 top-2.5"><Trophy className="h-3 w-3" aria-hidden="true" />Won</Badge>}
                      footer={(
                        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                          <PrizeLine c={c} />
                          {c.winner_selected_at || c.completed_at
                            ? <p className="text-[11px] text-muted">{dateShort(c.completed_at || c.winner_selected_at)}</p>
                            : null}
                        </div>
                      )}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-snug text-muted">
                Prize shown is the contest’s published prize, not a payout. The winning entries themselves are in the{' '}
                <Link to="/winners" className="font-semibold text-primary hover:underline">Winners hub</Link>.
              </p>
            </>
          ) : (
            <EmptyState
              icon={Trophy}
              title="No wins yet"
              description={isMe ? 'Enter a contest — wins appear here once results are finalized.' : 'Contests this creator wins will be listed here once results are finalized.'}
              action={isMe ? <Button to="/explore">Browse contests</Button> : undefined}
            />
          )}
        </section>
      )}

      {/* ── Creator: measured performance + history ── */}
      {view === 'performance' && (
        <section aria-labelledby="performance-heading" className="space-y-4">
          <h2 id="performance-heading" className="font-display text-lg font-bold text-ink">Measured performance</h2>

          {perfState === 'loading' ? (
            <Skeleton className="h-28 rounded-lg" />
          ) : perfState === 'error' ? (
            <SectionError title="Performance could not be loaded" />
          ) : (
            <>
              <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 sm:p-5">
                <Metric label="Contests scored" value={num(perf.contests_scored)} />
                <Metric label="Average final score" value={num(perf.average_final_score)} />
                <Metric label="Best final score" value={num(perf.best_final_score)} />
              </Card>
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                <BarChart3 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Scores are produced by RazeKit’s scoring engine from finalized contests. A dimension that was never
                measured is shown as “Not measured” — it is not counted as zero.
              </p>

              <h3 className="pt-1 font-display text-base font-bold text-ink">History</h3>
              {(perf.winning_work || []).length ? (
                <Card className="p-4 sm:p-5">
                  <Timeline
                    steps={(perf.winning_work || []).map((wk) => ({
                      key: wk.contest_id,
                      done: true,
                      label: wk.title || 'Contest',
                      detail: [
                        wk.brand_name ? `for ${wk.brand_name}` : null,
                        num(wk.final_score) === null ? 'Final score not measured' : `Final score ${num(wk.final_score)}`,
                      ].filter(Boolean).join(' · '),
                      at: wk.finalized_at ? dateShort(wk.finalized_at) : null,
                    }))}
                  />
                </Card>
              ) : (
                <EmptyState
                  icon={Trophy}
                  title="No finalized results yet"
                  description="Only finalized contest results appear in a public history."
                />
              )}
            </>
          )}
        </section>
      )}

      {/* ── Creator: reviews ── */}
      {view === 'reviews' && (
        <section aria-labelledby="reviews-heading" className="space-y-3">
          <h2 id="reviews-heading" className="sr-only">Reviews</h2>
          {reviews === null ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
            </div>
          ) : reviewsErr ? (
            <SectionError title="Reviews could not be loaded" onRetry={loadReviews} />
          ) : reviews.length ? (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                <div className="flex items-center gap-3">
                  <p className="font-display text-3xl font-extrabold leading-none tracking-tight text-ink nums">
                    {rating === null ? <span className="text-base text-muted">Not rated</span> : rating}
                  </p>
                  {rating !== null && <Stars value={Math.round(rating)} />}
                </div>
                <p className="text-sm text-muted">
                  Based on {reviews.length} published {reviews.length === 1 ? 'review' : 'reviews'} from completed contests.
                </p>
              </Card>

              <ul className="space-y-3">
                {reviews.map((r) => (
                  <Card as="li" key={r.id} className="p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {num(r.overall_rating) === null
                        ? <span className="text-[12px] text-muted">Rating not recorded</span>
                        : <Stars value={r.overall_rating} />}
                      {r.verified && <Badge tone="success">Verified</Badge>}
                    </div>
                    {r.review_text && <p className="text-sm leading-relaxed text-ink/90">“{r.review_text}”</p>}
                    {r.created_date && <p className="mt-2 text-xs text-muted">{dateShort(r.created_date)}</p>}
                  </Card>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No reviews yet"
              description="Verified brand reviews appear after completed contests."
              action={isMe ? <Button to="/explore" variant="secondary">Find a contest</Button> : undefined}
            />
          )}
        </section>
      )}

      {/* ── Brand: campaigns ── */}
      {view === 'campaigns' && (
        <section aria-labelledby="campaigns-heading" className="space-y-3">
          <h2 id="campaigns-heading" className="sr-only">Campaigns</h2>
          {(campaigns || []).length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((c) => (
                <li key={c.id} className="min-w-0">
                  <ContestTile
                    c={c}
                    badge={c.status && (
                      <Badge tone={c.status === 'open' ? 'primary' : 'neutral'} className="absolute left-2.5 top-2.5 capitalize">
                        {String(c.status).replace(/[_-]+/g, ' ')}
                      </Badge>
                    )}
                    footer={(
                      <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
                        <PrizeLine c={c} />
                        {c.deadline && <p className="text-[11px] text-muted">{dateShort(c.deadline)}</p>}
                      </div>
                    )}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Megaphone}
              title="No public campaigns"
              description={isMe ? 'Your contests appear here once you publish one.' : 'This brand has not published a contest yet.'}
              action={isMe ? <Button to="/create-contest">Create a contest</Button> : undefined}
            />
          )}
        </section>
      )}

      {/* ── Brand: completed collaborations ── */}
      {view === 'collaborations' && (
        <section aria-labelledby="collabs-heading" className="space-y-3">
          <h2 id="collabs-heading" className="sr-only">Completed collaborations</h2>
          {completed.length ? (
            <>
              <ul className="space-y-3">
                {completed.map((c) => (
                  <Card as="li" key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-display text-sm font-bold text-ink">
                        <Link to={`/contest/${c.id}`} className="rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          {c.title || 'Contest'}
                        </Link>
                      </h3>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {c.completed_at || c.winner_selected_at
                          ? `Finalized ${dateShort(c.completed_at || c.winner_selected_at)}`
                          : 'Finalized date not recorded'}
                        {c.handover_required ? ' · account handover required' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="font-display text-base font-extrabold text-primary nums">{money(c.prize_amount, c.currency)}</p>
                      {c.winner_user_id ? (
                        <Link
                          to={`/u/${c.winner_user_id}`}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Handshake className="h-4 w-4" aria-hidden="true" />Winning creator
                        </Link>
                      ) : (
                        <span className="text-[12px] text-muted">Winner not recorded</span>
                      )}
                    </div>
                  </Card>
                ))}
              </ul>
              <p className="text-[11px] leading-snug text-muted">
                Prize shown is each contest’s published prize. What a brand paid in total, and what a creator received,
                are private to them.
              </p>
            </>
          ) : (
            <EmptyState
              icon={Handshake}
              title="No completed collaborations yet"
              description="A campaign appears here once its winner is finalized."
            />
          )}
        </section>
      )}
    </div>
  );
}
