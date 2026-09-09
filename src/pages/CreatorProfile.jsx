// Public creator profile (/u/:id) — identity first, then proof of work:
// portfolio, finalized wins and verified brand reviews. Read-only presentation.
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, Trophy, Grid3x3, MessageSquare, BadgeCheck, Play } from 'lucide-react';
import { entities, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, dateShort } from '@/lib/format';
import { Card, Button, Badge, Avatar, Segmented, EmptyState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

function cover(id = '') { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`; }

const isVideo = (url = '') => /\.(mp4|webm|mov)/i.test(url);

/** Star rating, read as a single value by assistive tech. */
function Stars({ value = 0, className }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cn('w-4 h-4', className, n <= value ? 'fill-warning text-warning' : 'text-line-strong')} />
      ))}
    </span>
  );
}

/** One headline number in the identity header. */
function HeroStat({ label, value, sub }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-ink nums">
        {value}
        {sub && <span className="ml-1.5 text-[12px] font-medium text-muted">{sub}</span>}
      </p>
    </div>
  );
}

/** Loading shape mirrors the real page: hero, tabs, then a media grid. */
function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card className="overflow-hidden">
        <Skeleton className="h-28 sm:h-32 w-full" />
        <div className="px-5 sm:px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-10">
            <Skeleton className="w-[88px] h-[88px] rounded-full ring-4 ring-surface" />
            <div className="flex-1 space-y-2 sm:pb-1">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-10 w-full sm:w-32" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full max-w-2xl" />
            <Skeleton className="h-3.5 w-2/3 max-w-md" />
          </div>
          <div className="mt-5 pt-4 border-t border-line flex flex-wrap gap-6">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-24" />)}
          </div>
        </div>
      </Card>
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
      </div>
    </div>
  );
}

export default function CreatorProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(undefined);
  // The User entity is not readable across accounts, so the display name
  // comes from a minimal public endpoint (no email, no role, no account state).
  const [publicProfile, setPublicProfile] = useState(null);
  const [posts, setPosts] = useState(null);
  const [wins, setWins] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('portfolio');

  useEffect(() => {
    fn('creatorPublicProfile', { creator_id: id }).then(setPublicProfile).catch(() => {});
    entities.UserProfile.filter({ user_id: id }, '-created_date', 1).then((l) => setProfile((l || [])[0] || null)).catch(() => { setProfile(null); setErr('We couldn’t load this profile right now. Some details may be missing.'); });
    entities.Post.filter({ author_id: id }, '-created_date', 60).then((l) => setPosts((l || []).filter((p) => p.media_url))).catch(() => setPosts([]));
    Promise.all([entities.Contest.filter({ winner_user_id: id, status: 'completed' }, '-created_date', 60).catch(() => []), entities.Contest.filter({ winner_user_id: id, status: 'winner_selected' }, '-created_date', 60).catch(() => [])]).then(([a, b]) => setWins([...(a || []), ...(b || [])]));
    entities.Review.filter({ creator_id: id, status: 'published' }, '-created_date', 60).then((l) => setReviews(l || [])).catch(() => setReviews([]));
  }, [id]);

  const rating = useMemo(() => {
    const list = reviews || [];
    return list.length ? (list.reduce((s, r) => s + (r.overall_rating || 0), 0) / list.length).toFixed(1) : null;
  }, [reviews]);
  const isMe = user?.id === id;
  const skills = (() => { try { return Array.isArray(profile?.skills) ? profile.skills : JSON.parse(profile?.skills || '[]'); } catch { return []; } })();

  if (profile === undefined) return <ProfileSkeleton />;

  const name = profile?.display_name || profile?.username || publicProfile?.name || 'Creator';
  const count = (list) => (list === null ? '—' : list.length);
  const tabLabel = (label, list) => (list === null ? label : <>{label}<span className="ml-1.5 nums font-normal opacity-60">{list.length}</span></>);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}

      {/* Identity header */}
      <Card className="overflow-hidden">
        <div className="relative h-28 sm:h-32" style={{ background: cover(id) }} aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-t from-ink/25 to-transparent" />
        </div>
        <div className="px-5 sm:px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-10">
            <div className="w-fit rounded-full ring-4 ring-surface shadow-xs"><Avatar name={name} src={profile?.avatar_url} size={88} /></div>
            <div className="flex-1 min-w-0 sm:pb-1">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-display text-2xl sm:text-[28px] font-extrabold tracking-tight text-ink truncate">{name}</h1>
                {profile?.username && <BadgeCheck className="w-5 h-5 shrink-0 text-primary" role="img" aria-label="Verified creator" />}
              </div>
              {profile?.professional_title
                ? <p className="mt-0.5 text-sm text-muted truncate">{profile.professional_title}</p>
                : profile?.username && <p className="mt-0.5 text-sm text-muted truncate">@{profile.username}</p>}
            </div>
            <div className="shrink-0 sm:pb-1">
              {isMe
                ? <Button to="/profile" variant="secondary" className="w-full sm:w-auto">Edit profile</Button>
                : <Button variant="secondary" className="w-full sm:w-auto"><MessageSquare className="w-4 h-4" aria-hidden="true" />Message</Button>}
            </div>
          </div>

          {profile?.bio && <p className="mt-4 text-sm text-ink/90 leading-relaxed max-w-2xl">{profile.bio}</p>}

          <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-start gap-x-8 gap-y-4">
            <HeroStat label="Wins" value={count(wins)} />
            <HeroStat label="Rating" value={rating ?? '—'} sub={reviews === null ? null : `(${reviews.length})`} />
            <HeroStat label="Portfolio" value={count(posts)} />
          </div>

          {skills.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {skills.slice(0, 5).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
              {skills.length > 5 && <span className="text-[11px] text-muted nums">+{skills.length - 5} more</span>}
            </div>
          )}
        </div>
      </Card>

      <div className="overflow-x-auto pb-1">
        <Segmented
          tabs={[
            { key: 'portfolio', label: tabLabel('Portfolio', posts) },
            { key: 'wins', label: tabLabel('Wins', wins) },
            { key: 'reviews', label: tabLabel('Reviews', reviews) },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Portfolio */}
      {tab === 'portfolio' && (posts === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      ) : posts.length ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                to="/feed"
                aria-label={p.title ? `View “${p.title}” on the feed` : 'View this work on the feed'}
                className="group relative block aspect-square rounded-lg overflow-hidden border border-line bg-ink transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5"
              >
                {isVideo(p.media_url) ? (
                  <>
                    <video src={p.media_url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    <span className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full bg-ink/60 text-white"><Play className="w-3 h-3 fill-white" aria-hidden="true" /></span>
                  </>
                ) : (
                  <img src={p.media_url} alt={p.title || ''} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                {p.title && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-2.5 pt-6 pb-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="block text-[12px] font-medium text-white line-clamp-2">{p.title}</span>
                  </span>
                )}
              </Link>
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
      ))}

      {/* Wins */}
      {tab === 'wins' && (wins === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
        </div>
      ) : wins.length ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wins.map((c) => (
            <li key={c.id}>
              <Link
                to={`/contest/${c.id}`}
                className="group flex h-full flex-col rounded-lg border border-line bg-surface overflow-hidden shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {c.cover_image_url
                    ? <img src={c.cover_image_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    : <div className="w-full h-full" style={{ background: cover(c.id) }} aria-hidden="true" />}
                  <Badge tone="success" className="absolute top-2.5 left-2.5"><Trophy className="w-3 h-3" aria-hidden="true" />Won</Badge>
                </div>
                <div className="p-3.5 flex flex-1 flex-col">
                  <p className="font-display font-bold text-ink text-sm leading-snug line-clamp-2">{c.title}</p>
                  <div className="mt-auto pt-2.5 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted font-medium">Prize won</p>
                      <p className="font-display text-lg font-extrabold text-primary nums">{money(c.prize_amount, c.currency)}</p>
                    </div>
                    {c.created_date && <p className="text-[11px] text-muted">{dateShort(c.created_date)}</p>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Trophy}
          title="No wins yet"
          description={isMe ? 'Enter a contest — wins appear here once results are finalized.' : 'Contests this creator wins will be listed here once results are finalized.'}
          action={isMe ? <Button to="/explore">Browse contests</Button> : undefined}
        />
      ))}

      {/* Reviews */}
      {tab === 'reviews' && (reviews === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : reviews.length ? (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-3">
              <p className="font-display text-3xl font-extrabold tracking-tight text-ink nums leading-none">{rating}</p>
              <Stars value={Math.round(Number(rating))} />
            </div>
            <p className="text-sm text-muted">
              Based on {reviews.length} published {reviews.length === 1 ? 'review' : 'reviews'} from completed contests.
            </p>
          </Card>

          <ul className="space-y-3">
            {reviews.map((r) => (
              <Card as="li" key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Stars value={r.overall_rating || 0} />
                  {r.verified && <Badge tone="success">Verified</Badge>}
                </div>
                {r.review_text && <p className="text-sm text-ink/90 leading-relaxed">“{r.review_text}”</p>}
                <p className="text-xs text-muted mt-2">{dateShort(r.created_date)}</p>
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
      ))}
    </div>
  );
}
