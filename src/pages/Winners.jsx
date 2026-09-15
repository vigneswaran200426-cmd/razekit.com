// Winners (spec 7/8/9/43) — a verified results showcase, not a social feed.
//
// The subject of this page is the WINNING VIDEO itself. That asset is stored on
// WinnerPublish and is a different thing from the contest's campaign cover, so
// this screen never substitutes the cover, a placeholder or another creator's
// media for it: when the winning media is missing the card says so out loud.
// Scores are read from the finalized snapshot; a dimension that was not
// measured renders as "Not measured", never as a zero — those are different
// claims. The leaderboard lives here too, and both views read the same
// authoritative records. Nothing on this page ranks by popularity.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, BarChart3, ShieldCheck, Play, ExternalLink, VideoOff,
  AlertCircle, RotateCcw, Film, Handshake, KeyRound,
} from 'lucide-react';
import { entities, fn } from '@/lib/api';
import { money, dateShort } from '@/lib/format';
import {
  PageHeader, Segmented, EmptyState, Skeleton, Badge, Card, Avatar, Button,
  Sheet, Metric, ScoreBar,
} from '@/components/ui';
import { ScoreStateBadge } from '@/components/Score';
import { cn } from '@/lib/cn';

const score = (n) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(1)) : null);

/* ── Honest media resolution ──────────────────────────────────────────────
   Everything below refuses to invent a URL. A link is rendered only when the
   backend actually stored one, and an embed only when the stored URL can be
   turned into that platform's own official embed address. */

const PLATFORM_LABEL = {
  youtube: 'YouTube', youtube_shorts: 'YouTube', instagram: 'Instagram',
  instagram_reels: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook',
  x: 'X', twitter: 'X', linkedin: 'LinkedIn', snapchat: 'Snapchat',
};

/** Only http(s) survives — a stored `file_uri` or a javascript: URL is not a link. */
function webUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

function platformLabel(stored, url) {
  const key = String(stored || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (PLATFORM_LABEL[key]) return PLATFORM_LABEL[key];
  if (stored) return String(stored).replace(/[_-]+/g, ' ');
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

/**
 * The platform's OWN embed address, derived from the stored post URL.
 *
 * We never reconstruct a platform's player or chrome ourselves — either the
 * real embed loads in its own frame, or the viewer gets a plain link out.
 */
function officialEmbed(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const slug = (s) => (/^[\w-]{5,64}$/.test(s || '') ? s : null);

  if (host === 'youtu.be') {
    const v = slug(u.pathname.slice(1));
    return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const v = slug(u.searchParams.get('v'))
      || (['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? slug(parts[1]) : null);
    return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
  }
  if (host === 'instagram.com') {
    const m = u.pathname.match(/^\/(p|reel|tv)\/([\w-]{5,32})/);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
  }
  if (host === 'tiktok.com') {
    const m = u.pathname.match(/\/video\/(\d{6,32})/);
    return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : null;
  }
  return null; // A platform we cannot embed officially gets a link, not a fake.
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;

/** What the RazeKit-hosted winning asset actually is — never guessed as video. */
function hostedKind(url, declared) {
  const d = String(declared || '').toLowerCase();
  if (d.includes('video')) return 'video';
  if (d.includes('image')) return 'image';
  if (VIDEO_EXT.test(url)) return 'video';
  if (IMAGE_EXT.test(url)) return 'image';
  return 'unknown';
}

/** One winner's publishable media, resolved once so every view agrees. */
function resolveMedia(pub) {
  const hosted = webUrl(pub?.media_url) || webUrl(pub?.media_uri);
  const poster = webUrl(pub?.thumbnail_url) || webUrl(pub?.thumbnail_uri);
  const external = webUrl(pub?.original_post_url);
  const embed = pub?.embed_available === true && external ? officialEmbed(external) : null;
  return {
    hosted,
    kind: hosted ? hostedKind(hosted, pub?.media_type) : null,
    poster,
    external,
    embed,
    platform: external ? platformLabel(pub?.original_platform, external) : null,
    any: Boolean(hosted || external),
  };
}

/* ── Media surfaces ─────────────────────────────────────────────────────── */

/** A 16:9 stage. Video is contained, never cropped — the entry is the point. */
function Stage({ className, children }) {
  return (
    <div className={cn('relative w-full aspect-video overflow-hidden bg-ink', className)}>
      {children}
    </div>
  );
}

function StageNotice({ icon: Icon, title, detail, action, tone = 'muted' }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-4 text-center">
      <div>
        <Icon
          className={cn('mx-auto h-6 w-6', tone === 'danger' ? 'text-danger' : 'text-white/55')}
          aria-hidden="true"
        />
        <p className="mt-2 text-[13px] font-semibold text-white">{title}</p>
        {detail && <p className="mx-auto mt-1 max-w-[34ch] text-[11px] leading-snug text-white/65">{detail}</p>}
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

/**
 * The winning entry, played on demand.
 *
 * Nothing preloads: the poster is the only byte fetched until someone presses
 * play, third-party embeds are not mounted until then either, and the parent
 * keeps a single `active` id so exactly one entry can be playing at a time.
 */
function WinnerMedia({ media, state, onRetry, creatorName, active, onActivate, allowEmbed = false, className }) {
  const label = creatorName ? `winning entry by ${creatorName}` : 'winning entry';

  if (state === 'loading') {
    return <Stage className={className}><Skeleton className="absolute inset-0 rounded-none" /></Stage>;
  }

  if (state === 'error') {
    return (
      <Stage className={className}>
        <StageNotice
          icon={AlertCircle}
          tone="danger"
          title="Winning video could not be loaded"
          detail="The published winner record did not come back. This is a loading problem, not a missing entry."
          action={onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-white/10 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
            </button>
          )}
        />
      </Stage>
    );
  }

  if (!media.any) {
    return (
      <Stage className={cn('bg-surface-2', className)}>
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div>
            <VideoOff className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-[13px] font-semibold text-ink">Winning video unavailable</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[11px] leading-snug text-muted">
              This result is finalized, but the winning entry has not been published to RazeKit yet.
            </p>
          </div>
        </div>
      </Stage>
    );
  }

  // The platform's own embed, mounted only once asked for.
  if (allowEmbed && media.embed) {
    return (
      <Stage className={className}>
        {active ? (
          <iframe
            src={media.embed}
            title={`The ${label} on ${media.platform || 'the original platform'}`}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <PosterButton
            poster={media.poster}
            label={`Play the ${label} on ${media.platform || 'the original platform'}`}
            caption={media.platform ? `Plays on ${media.platform}` : 'Plays on the original platform'}
            onClick={onActivate}
          />
        )}
      </Stage>
    );
  }

  if (media.hosted && media.kind !== 'image') {
    return (
      <Stage className={className}>
        {active ? (
          <video
            src={media.hosted}
            poster={media.poster || undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={`The ${label}`}
            className="absolute inset-0 h-full w-full object-contain bg-ink"
          />
        ) : (
          <PosterButton
            poster={media.poster}
            label={`Play the ${label}`}
            caption={media.kind === 'unknown' ? 'Winning entry' : null}
            onClick={onActivate}
          />
        )}
      </Stage>
    );
  }

  // A winning entry whose published asset is a still, shown as what it is.
  if (media.hosted) {
    return (
      <Stage className={className}>
        <img
          src={media.hosted}
          alt={`The ${label}`}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <span className="absolute bottom-2 left-2 rounded bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          Still image entry
        </span>
      </Stage>
    );
  }

  // Published only off-platform: say so, and link out rather than fake a player.
  return (
    <Stage className={cn('bg-surface-2', className)}>
      <div className="absolute inset-0 grid place-items-center px-4 text-center">
        <div>
          <Film className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-semibold text-ink">
            Published on {media.platform || 'another platform'}
          </p>
          <p className="mx-auto mt-1 max-w-[34ch] text-[11px] leading-snug text-muted">
            RazeKit does not host a copy of this winning entry.
          </p>
        </div>
      </div>
    </Stage>
  );
}

/** Poster + play control. Without a stored poster it stays a neutral panel. */
function PosterButton({ poster, label, caption, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
    >
      {poster ? (
        <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <span className="absolute inset-0 bg-gradient-to-br from-ink to-[#101a2b]" aria-hidden="true" />
      )}
      <span className="absolute inset-0 grid place-items-center bg-ink/25 transition-colors group-hover:bg-ink/35">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 shadow-md transition-transform duration-200 ease-brand motion-safe:group-hover:scale-105">
          <Play className="h-6 w-6 translate-x-0.5 fill-ink text-ink" aria-hidden="true" />
        </span>
      </span>
      {caption && (
        <span className="absolute bottom-2 left-2 rounded bg-ink/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {caption}
        </span>
      )}
    </button>
  );
}

/** The stored original post, linked only when a URL actually exists. */
function ExternalPostLink({ media, className }) {
  if (!media.external) return null;
  return (
    <a
      href={media.external}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-primary',
        'hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded',
        className
      )}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      View on {media.platform || 'the original platform'}
    </a>
  );
}

/* ── Scores ─────────────────────────────────────────────────────────────── */

// Weights are contest-configurable server-side, so none are asserted here.
function ScoreDimensions({ w }) {
  return (
    <div className="space-y-3">
      <ScoreBar
        label="Video engagement"
        score={score(w.engagement_score)}
        reason="No verified engagement data was recorded for this entry."
      />
      <ScoreBar
        label="Brand traffic"
        score={score(w.traffic_score)}
        tone="success"
        reason="No verified visits to the brand were attributed to this entry."
      />
      <ScoreBar
        label="Final score"
        score={score(w.final_score)}
        reason="This contest was finalized without a computed final score."
      />
    </div>
  );
}

/* ── Winner card ────────────────────────────────────────────────────────── */

/**
 * The work first, then who made it, then the result.
 *
 * Not a single big link: the card holds a play control, a creator link and a
 * contest link, and nesting those inside one anchor would make them
 * unreachable by keyboard.
 */
function WinnerCard({ w, media, mediaState, onRetry, active, onActivate, onOpen }) {
  const f = score(w.final_score);
  return (
    <Card as="article" className="flex flex-col overflow-hidden">
      <WinnerMedia
        media={media}
        state={mediaState}
        onRetry={onRetry}
        creatorName={w.creator_name}
        active={active}
        onActivate={onActivate}
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge tone="success" className="mb-1.5">
              <Trophy className="h-3 w-3" aria-hidden="true" /> Winner
            </Badge>
            <h3 className="font-display text-[15px] font-bold leading-snug text-ink">
              <Link
                to={`/contest/${w.contest_id}`}
                className="line-clamp-2 rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {w.title}
              </Link>
            </h3>
            {w.brand_name && <p className="mt-0.5 text-[12px] text-muted">for {w.brand_name}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Final</p>
            <p className={cn('font-display font-extrabold nums leading-tight text-ink', f === null ? 'text-[11px] text-muted' : 'text-xl')}>
              {f === null ? 'Not measured' : f}
            </p>
          </div>
        </div>

        {w.creator_id ? (
          <Link
            to={`/u/${w.creator_id}`}
            className="-mx-1 flex min-h-[44px] items-center gap-2 rounded px-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Avatar name={w.creator_name || 'Creator'} size={28} />
            <span className="truncate text-[13px] font-medium text-ink">{w.creator_name || 'Creator'}</span>
          </Link>
        ) : (
          <p className="text-[13px] text-muted">Creator not recorded</p>
        )}

        <ScoreDimensions w={w} />

        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-line pt-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Prize</p>
            <p className="font-display text-lg font-extrabold text-primary nums">{money(w.prize_amount, w.currency)}</p>
          </div>
          <div className="text-right">
            {w.finalized_at
              ? <p className="text-[11px] text-muted">Finalized {dateShort(w.finalized_at)}</p>
              : <p className="text-[11px] text-muted">Finalized date not recorded</p>}
            <button
              type="button"
              onClick={onOpen}
              className="mt-0.5 rounded text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Full result
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── Winner detail ──────────────────────────────────────────────────────── */

const HANDOVER_TONE = { completed: 'success', winner_confirmed: 'primary', in_progress: 'primary', initiated: 'primary' };

/**
 * Collaboration / account-handover, shown only when the contest required it.
 *
 * The requirement is public (it is part of the brief); the progress record is
 * not, so when it is unreadable this says whose it is instead of guessing.
 */
function CollaborationState({ contest, handover, state }) {
  if (state === 'loading') return <Skeleton className="h-16 rounded-lg" />;
  if (!contest) return null;

  const needsHandover = contest.handover_required === true
    || (contest.post_winner_action && contest.post_winner_action !== 'none');
  const collab = contest.collaboration_type && contest.collaboration_type !== 'none'
    ? contest.collaboration_type : null;
  if (!needsHandover && !collab) return null;

  return (
    <section className="rounded-lg border border-line bg-surface-2/60 p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">After the win</h4>
      <ul className="mt-2 space-y-2">
        {needsHandover && (
          <li className="flex gap-2">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Account handover required</p>
              <p className="text-[11px] leading-snug text-muted">
                The winner transfers the {contest.account_property_type || 'publishing account'} to the brand through RazeKit.
              </p>
            </div>
          </li>
        )}
        {collab && (
          <li className="flex gap-2">
            <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium capitalize text-ink">{String(collab).replace(/[_-]+/g, ' ')} collaboration</p>
              {contest.collaboration_duration && (
                <p className="text-[11px] leading-snug text-muted">Agreed for {contest.collaboration_duration}.</p>
              )}
            </div>
          </li>
        )}
      </ul>
      <div className="mt-2.5 border-t border-line pt-2.5">
        {handover ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={HANDOVER_TONE[handover.status] || 'neutral'} className="capitalize">
              {String(handover.status || 'not started').replace(/[_-]+/g, ' ')}
            </Badge>
            {handover.completed_at && <span className="text-[11px] text-muted">Completed {dateShort(handover.completed_at)}</span>}
          </div>
        ) : (
          <p className="text-[11px] leading-snug text-muted">
            Handover progress is private to the brand and the winner.
          </p>
        )}
      </div>
    </section>
  );
}

function WinnerDetail({ w, media, mediaState, onRetry }) {
  const [playing, setPlaying] = useState(false);
  const [contest, setContest] = useState(null);
  const [handover, setHandover] = useState(null);
  const [ctxState, setCtxState] = useState('loading');

  useEffect(() => {
    let alive = true;
    setPlaying(false);
    setCtxState('loading');
    if (!w?.contest_id) { setCtxState('done'); return undefined; }
    Promise.all([
      entities.Contest.get(w.contest_id).catch(() => null),
      entities.Handover.filter({ contest_id: w.contest_id }, '-created_date', 1).catch(() => []),
    ]).then(([c, h]) => {
      if (!alive) return;
      setContest(c || null);
      setHandover((h || [])[0] || null);
      setCtxState('done');
    });
    return () => { alive = false; };
  }, [w?.contest_id]);

  return (
    <div className="space-y-4">
      <div className="-mx-5 -mt-4 sm:mx-0 sm:mt-0 sm:overflow-hidden sm:rounded-lg">
        <WinnerMedia
          media={media}
          state={mediaState}
          onRetry={onRetry}
          creatorName={w.creator_name}
          active={playing}
          onActivate={() => setPlaying(true)}
          allowEmbed
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success"><Trophy className="h-3 w-3" aria-hidden="true" /> Winner</Badge>
        {w.score_state && <ScoreStateBadge state={w.score_state} />}
        {media.embed && media.platform && <Badge tone="neutral">{media.platform} embed</Badge>}
      </div>

      <ExternalPostLink media={media} />

      <div className="grid grid-cols-2 gap-4">
        <Metric label="Prize" value={money(w.prize_amount, w.currency)} />
        <Metric label="Finalized" value={w.finalized_at ? dateShort(w.finalized_at) : null} empty="Not recorded" />
      </div>

      <dl className="divide-y divide-line border-y border-line">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[13px] text-muted">Creator</dt>
          <dd className="min-w-0 text-right">
            {w.creator_id ? (
              <Link to={`/u/${w.creator_id}`} className="inline-flex items-center gap-2 rounded text-[13px] font-semibold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Avatar name={w.creator_name || 'Creator'} size={22} />
                <span className="truncate">{w.creator_name || 'Creator'}</span>
              </Link>
            ) : <span className="text-[13px] text-muted">Not recorded</span>}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[13px] text-muted">Brand</dt>
          <dd className="min-w-0 truncate text-right text-[13px] font-semibold text-ink">
            {w.brand_name || <span className="font-normal text-muted">Not recorded</span>}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[13px] text-muted">Contest</dt>
          <dd className="min-w-0 text-right">
            <Link to={`/contest/${w.contest_id}`} className="rounded text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {w.title}
            </Link>
          </dd>
        </div>
      </dl>

      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">How this was scored</h4>
        <div className="mt-2.5"><ScoreDimensions w={w} /></div>
        {w.scoring_version && (
          <p className="mt-2 text-[11px] text-muted">Scoring version {w.scoring_version}.</p>
        )}
      </div>

      <CollaborationState contest={contest} handover={handover} state={ctxState} />

      <Button to={`/contest/${w.contest_id}`} variant="secondary" className="w-full">Open the contest</Button>
    </div>
  );
}

/* ── Winning work ───────────────────────────────────────────────────────── */

function Showcase() {
  const [items, setItems] = useState(null);
  const [itemsError, setItemsError] = useState(false);
  const [publishes, setPublishes] = useState(null);
  const [mediaError, setMediaError] = useState(false);
  const [tab, setTab] = useState('recent');
  const [playing, setPlaying] = useState(null);
  const [open, setOpen] = useState(null);

  const loadWinners = useCallback(() => {
    setItems(null); setItemsError(false);
    fn('winnersShowcase', { limit: 60 })
      .then((d) => setItems(d.winners || []))
      .catch(() => { setItems([]); setItemsError(true); });
  }, []);

  // The winning asset lives on WinnerPublish, which the showcase payload does
  // not carry; only rows the publisher marked published are readable at all.
  const loadMedia = useCallback(() => {
    setPublishes(null); setMediaError(false);
    entities.WinnerPublish.filter({ status: 'published' }, '-created_date', 200)
      .then((rows) => setPublishes(rows || []))
      .catch(() => { setPublishes([]); setMediaError(true); });
  }, []);

  useEffect(() => { loadWinners(); loadMedia(); }, [loadWinners, loadMedia]);

  const mediaIndex = useMemo(() => {
    const bySubmission = new Map();
    const byContest = new Map();
    for (const p of publishes || []) {
      if (p.submission_id && !bySubmission.has(p.submission_id)) bySubmission.set(p.submission_id, p);
      if (p.contest_id && !byContest.has(p.contest_id)) byContest.set(p.contest_id, p);
    }
    return { bySubmission, byContest };
  }, [publishes]);

  const mediaFor = useCallback((w) => {
    const pub = (w.submission_id && mediaIndex.bySubmission.get(w.submission_id))
      || mediaIndex.byContest.get(w.contest_id)
      || null;
    return resolveMedia(pub);
  }, [mediaIndex]);

  const sorted = useMemo(() => {
    if (!items) return [];
    const a = [...items];
    if (tab === 'prize') a.sort((x, y) => (y.prize_amount || 0) - (x.prize_amount || 0));
    else if (tab === 'score') a.sort((x, y) => (y.final_score ?? -1) - (x.final_score ?? -1));
    else a.sort((x, y) => Date.parse(y.finalized_at || 0) - Date.parse(x.finalized_at || 0));
    return a;
  }, [items, tab]);

  const mediaState = publishes === null ? 'loading' : mediaError ? 'error' : 'ready';
  const openRow = open ? sorted.find((w) => (w.submission_id || w.contest_id) === open) : null;

  return (
    <section className="space-y-4" aria-labelledby="winning-work-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="winning-work-heading" className="font-display text-lg font-bold text-ink">Winning work</h2>
        <div className="overflow-x-auto">
          <Segmented
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'recent', label: 'Recent' },
              { key: 'score', label: 'Top score' },
              { key: 'prize', label: 'Highest prize' },
            ]}
          />
        </div>
      </div>

      {items === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[26rem] rounded-lg" />)}
        </div>
      ) : itemsError ? (
        <EmptyState
          icon={AlertCircle}
          title="Winners could not be loaded"
          description="Something went wrong reading the finalized results. Nothing is missing — the list just did not arrive."
          action={<Button variant="secondary" onClick={loadWinners}><RotateCcw className="h-4 w-4" aria-hidden="true" />Try again</Button>}
        />
      ) : sorted.length ? (
        <ul className="grid list-none gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((w) => {
            const key = w.submission_id || w.contest_id;
            return (
              <li key={key} className="min-w-0">
                <WinnerCard
                  w={w}
                  media={mediaFor(w)}
                  mediaState={mediaState}
                  onRetry={loadMedia}
                  active={playing === key}
                  onActivate={() => setPlaying(key)}
                  onOpen={() => { setPlaying(null); setOpen(key); }}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Trophy}
          title="No finalized winners yet"
          description="Winning work appears here once a contest is officially finalized."
        />
      )}

      <Sheet
        open={Boolean(openRow)}
        onClose={() => setOpen(null)}
        side="right"
        title={openRow ? openRow.title : 'Result'}
        description={openRow?.creator_name ? `Won by ${openRow.creator_name}` : undefined}
      >
        {openRow && (
          <WinnerDetail
            w={openRow}
            media={mediaFor(openRow)}
            mediaState={mediaState}
            onRetry={loadMedia}
          />
        )}
      </Sheet>
    </section>
  );
}

/* ── Leaderboard ────────────────────────────────────────────────────────── */

const RANK_TONE = ['text-warning', 'text-[#9aa4b2]', 'text-[#b06a2c]'];
const avg = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

function LeaderRow({ r }) {
  const a = avg(r.average_final_score);
  return (
    <Card as="li" className="flex items-center gap-3 p-3">
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-muted nums">{r.rank}</span>
      <Avatar name={r.creator_name || 'Creator'} size={36} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <Link
          to={`/u/${r.creator_id}`}
          className="block truncate rounded text-[14px] font-semibold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {r.creator_name || 'Creator'}
        </Link>
        <p className="text-[11px] text-muted nums">
          {r.wins} {r.wins === 1 ? 'win' : 'wins'} · avg {a === null ? 'not measured' : a}
        </p>
      </div>
      <span className="shrink-0 font-display text-[15px] font-extrabold text-primary nums">
        {money(r.prize, r.currency || 'INR')}
      </span>
    </Card>
  );
}

function LeaderboardPanel() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setD(null); setErr(false);
    fn('winnersLeaderboard', { limit: 50 })
      .then(setD)
      .catch(() => { setD({ leaderboard: [] }); setErr(true); });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (d === null) {
    return (
      <section className="space-y-2" aria-busy="true" aria-labelledby="leaderboard-heading">
        <h2 id="leaderboard-heading" className="sr-only">Leaderboard</h2>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </section>
    );
  }

  if (err) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Leaderboard could not be loaded"
        description="The ranking did not come back. No creator has been left out — the list simply failed to load."
        action={<Button variant="secondary" onClick={load}><RotateCcw className="h-4 w-4" aria-hidden="true" />Try again</Button>}
      />
    );
  }

  const rows = d.leaderboard || [];
  if (!rows.length) {
    return <EmptyState icon={BarChart3} title="No ranked creators yet" description="The leaderboard fills in as contests are finalized." />;
  }

  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <section className="space-y-5" aria-labelledby="leaderboard-heading">
      <h2 id="leaderboard-heading" className="font-display text-lg font-bold text-ink">Leaderboard</h2>

      {/* A three-up podium needs width to be readable; on a phone the top three
          are just the first three rows of the same list. */}
      <ul className="grid list-none gap-3 sm:hidden">
        {top.map((r) => <LeaderRow key={r.creator_id} r={r} />)}
      </ul>

      <div className="hidden items-end gap-3 sm:grid sm:grid-cols-3">
        {[1, 0, 2].map((idx) => {
          const r = top[idx];
          if (!r) return <div key={idx} />;
          const first = idx === 0;
          const a = avg(r.average_final_score);
          return (
            <Link
              key={r.creator_id}
              to={`/u/${r.creator_id}`}
              className={cn(
                'rounded-xl border bg-surface p-4 text-center shadow-xs transition-all ease-brand hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                first ? 'border-primary/40 bg-gradient-to-b from-primary/[0.06] to-transparent' : 'border-line'
              )}
            >
              <div className="relative inline-block">
                <Avatar name={r.creator_name || 'Creator'} size={first ? 60 : 48} className="mx-auto" />
                <span className={cn('absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface font-display text-[13px] font-extrabold', RANK_TONE[idx])}>
                  {idx + 1}
                </span>
              </div>
              <p className="mt-2.5 truncate font-display text-sm font-bold text-ink">{r.creator_name || 'Creator'}</p>
              <p className="text-[11px] text-muted nums">
                {r.wins} {r.wins === 1 ? 'win' : 'wins'} · avg {a === null ? 'not measured' : a}
              </p>
              <p className={cn('mt-1 font-display font-extrabold text-primary nums', first && 'text-lg')}>
                {money(r.prize, r.currency || 'INR')}
              </p>
            </Link>
          );
        })}
      </div>

      {rest.length > 0 && (
        <>
          {/* Phones get rows; a five-column table only earns its width later. */}
          <ul className="grid list-none gap-2 md:hidden">
            {rest.map((r) => <LeaderRow key={r.creator_id} r={r} />)}
          </ul>

          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Creators ranked by finalized contest performance</caption>
              <thead className="border-b border-line bg-surface-2">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th scope="col" className="px-4 py-2.5 font-semibold">#</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Creator</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Wins</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Avg score</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Prize</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((r) => {
                  const a = avg(r.average_final_score);
                  return (
                    <tr key={r.creator_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-muted nums">{r.rank}</td>
                      <td className="px-3 py-2.5">
                        <Link to={`/u/${r.creator_id}`} className="rounded font-medium text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          {r.creator_name || 'Creator'}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right nums">{r.wins}</td>
                      <td className="px-3 py-2.5 text-right text-muted nums">{a === null ? 'Not measured' : a}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-primary nums">{money(r.prize, r.currency || 'INR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {d.basis && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
          {d.basis}
        </p>
      )}
    </section>
  );
}

export default function Winners() {
  const [view, setView] = useState('showcase');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Winners"
        description="Officially finalized winning work, and the creators ranked by real contest performance."
      />
      <div className="overflow-x-auto pb-1">
        <Segmented
          value={view}
          onChange={setView}
          tabs={[
            { key: 'showcase', label: 'Winning work' },
            { key: 'leaderboard', label: 'Leaderboard' },
          ]}
        />
      </div>
      {view === 'showcase' ? <Showcase /> : <LeaderboardPanel />}
    </div>
  );
}
