// Upcoming-poll carousel (home page) — a community vote on tournaments RazeKit
// is considering, built so it can never be mistaken for a live contest.
//
// What this component refuses to do: it never invents a number. Every count on
// screen came back from `pollList` / `pollVote`. A count the API did not return
// renders as "Not measured"; a count of 0 renders as 0; nothing counts up from a
// seeded value, and a vote is never added locally — the bar only moves when the
// server tells us it moved. The 10,00,000 figure is labelled a target, never a
// claim, and the prize pool is labelled as the proposal being voted on rather
// than funded money. There is no Join, no countdown, no prize-claim language.
// If the API fails the section goes quiet instead of rendering a plausible
// banner, because a fabricated banner here would be a lie about demand.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Loader2, Vote } from 'lucide-react';
import { fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { moneyMinor } from '@/lib/format';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

/* ── Numbers ───────────────────────────────────────────────────────────────
   Indian digit grouping throughout, matching money() in lib/format. `num`
   deliberately maps null/undefined to null rather than 0, so "we did not
   measure this" and "we measured zero" can never collapse into each other. */
const IN_GROUP = new Intl.NumberFormat('en-IN');

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const grouped = (v) => (num(v) === null ? null : IN_GROUP.format(num(v)));

// Crore / lakh is how an Indian reader parses a large rupee figure at a glance.
// Pure unit conversion of the amount the API sent — no rounding up, no padding.
function scaleWord(major, currency) {
  if (currency !== 'INR' || !Number.isFinite(major)) return null;
  // Truncated, never rounded: rounding 99.9999 lakh up to "100 lakh" would
  // read as a bigger prize than the figure printed beside it.
  const say = (x, unit) => `${Number((Math.floor(x * 100) / 100).toFixed(2))} ${unit}`;
  if (major >= 1e7) return say(major / 1e7, 'crore');
  if (major >= 1e5) return say(major / 1e5, 'lakh');
  return null;
}

/* ── Data ──────────────────────────────────────────────────────────────────
   Tolerant of the envelope the endpoint chooses, strict about the contents:
   a row without a slug cannot be voted on, so it is not shown at all.

   Visibility is the server's call, not ours. We deny-list exactly the statuses
   pollList already treats as hidden instead of allow-listing 'upcoming' —
   an allow-list here silently deletes every other state the server can return
   ('open', 'voting', and 'voting_complete', which pollVote sets the moment a
   poll reaches its target), so the banner would vanish from the page at the
   exact moment the vote succeeded. */
const HIDDEN_STATUSES = new Set(['draft', 'hidden', 'archived', 'cancelled']);

function readPolls(raw) {
  const list = Array.isArray(raw) ? raw : raw?.polls || raw?.campaigns || raw?.items || [];
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && p.slug && !HIDDEN_STATUSES.has(String(p.status || '')))
    // Editor order, rows without one last — the same rule the server sorts by,
    // so this re-sort can never reshuffle an order the server already set.
    .sort((a, b) => (num(a.display_order) ?? Number.MAX_SAFE_INTEGER)
      - (num(b.display_order) ?? Number.MAX_SAFE_INTEGER));
}

const CHOICES = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
];

/* ── One banner ────────────────────────────────────────────────────────── */
function PollBanner({ poll, onVoted }) {
  const { status: authStatus } = useAuth();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const uid = `poll-${poll.slug}`;
  const total = num(poll.total_votes);
  const target = num(poll.vote_target);
  const yes = num(poll.yes_votes);
  const no = num(poll.no_votes);
  const prizeMinor = num(poll.prize_pool_minor);
  const currency = poll.currency || 'INR';
  const myVote = poll.my_vote === 'yes' || poll.my_vote === 'no' ? poll.my_vote : null;

  // Only a measured count against a stated target can draw a bar.
  const pct = total !== null && target !== null && target > 0
    ? Math.min(100, Math.max(0, (total / target) * 100))
    : null;

  const needsAuth = poll.requires_auth !== false;

  // Whether this poll still accepts votes is the server's answer (`is_open`),
  // and pollVote rejects a closed poll with 409 regardless of what we render.
  // A row from an endpoint that does not send the field is treated as open, so
  // the buttons still appear and the server stays the authority.
  const openState = poll.is_open === false
    ? (Date.parse(poll.opens_at || '') > Date.now() ? 'not_yet' : 'closed')
    : 'open';

  const closedLine = openState === 'not_yet'
    ? 'Voting has not opened yet.'
    : poll.target_reached_at
      ? 'Voting closed — this poll reached its vote target.'
      : 'Voting on this poll has closed.';

  async function vote(choice) {
    if (busy || myVote || openState !== 'open') return;
    // Only short-circuit on a *known* signed-out visitor. While auth is still
    // loading we send the request and let a 401 be the authority.
    if (needsAuth && authStatus === 'visitor') { setNeedsLogin(true); setErr(null); return; }
    setBusy(choice);
    setErr(null);
    setNeedsLogin(false);
    try {
      const r = await fn('pollVote', { slug: poll.slug, choice });
      const server = r?.poll || r?.campaign || r || {};
      // Counts are copied from the response only. If the server chose not to
      // return them, the previously measured values stay on screen unchanged —
      // we do not add one to make the UI feel responsive.
      onVoted(poll.slug, {
        my_vote: server.my_vote === 'yes' || server.my_vote === 'no' ? server.my_vote : choice,
        ...(num(server.total_votes) !== null ? { total_votes: num(server.total_votes) } : {}),
        ...(num(server.yes_votes) !== null ? { yes_votes: num(server.yes_votes) } : {}),
        ...(num(server.no_votes) !== null ? { no_votes: num(server.no_votes) } : {}),
      });
    } catch (e) {
      if (e?.status === 401) setNeedsLogin(true);
      else setErr(e?.message || 'Your vote could not be recorded.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs transition-shadow duration-base ease-brand hover:shadow-md">
      {/* Media */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-2">
        {poll.banner_url ? (
          <img
            src={poll.banner_url}
            alt={poll.banner_alt || ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="hatch h-full w-full" aria-hidden="true" />
        )}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent" aria-hidden="true" />
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
            Upcoming
          </span>
          <span className="rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
            {openState === 'open' ? 'Community vote' : openState === 'not_yet' ? 'Vote not open yet' : 'Vote closed'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          {poll.theme && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">{poll.theme}</p>
          )}
          <h3 className="mt-1 font-display text-[17px] font-extrabold leading-snug tracking-tight text-ink sm:text-lg">
            {poll.title}
          </h3>
          {poll.question && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{poll.question}</p>}
          {poll.supporting_line && (
            <p className="mt-1 text-[12px] leading-relaxed text-muted/90">{poll.supporting_line}</p>
          )}
        </div>

        {/* Prize pool — the proposal on the ballot, not money that exists. */}
        {prizeMinor !== null && (
          <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Proposed prize pool</p>
            <p className="font-display text-xl font-extrabold tracking-tight text-ink nums">
              {moneyMinor(prizeMinor, currency)}
              {scaleWord(prizeMinor / 100, currency) && (
                <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {scaleWord(prizeMinor / 100, currency)}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">The figure being voted on, if this tournament is built.</p>
          </div>
        )}

        <div className="mt-auto space-y-3 border-t border-line pt-3.5">
          {/* Choice */}
          {myVote ? (
            <div className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface-2 px-3.5">
              <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-ink">
                You voted <span className="uppercase tracking-wide">{myVote}</span>
              </p>
            </div>
          ) : openState !== 'open' ? (
            // No buttons on a poll the server will refuse. Offering a vote that
            // comes back 409 is a small lie about what is still possible here.
            <div className="flex min-h-11 items-center rounded-md border border-line bg-surface-2 px-3.5 py-2">
              <p className="text-[13px] font-semibold leading-snug text-muted">{closedLine}</p>
            </div>
          ) : (
            <div role="group" aria-labelledby={`${uid}-cta`}>
              <p id={`${uid}-cta`} className="mb-2 text-[13px] font-semibold text-ink">
                {poll.cta_label || 'Should RazeKit build this tournament?'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CHOICES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => vote(c.key)}
                    disabled={!!busy}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-2 rounded-md border text-[14px] font-bold uppercase tracking-[0.08em] transition-colors duration-fast ease-brand',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                      'disabled:opacity-60 disabled:pointer-events-none',
                      c.key === 'yes'
                        ? 'border-primary/40 bg-primary/[0.07] text-primary hover:bg-primary/[0.12]'
                        : 'border-line-strong bg-surface text-muted hover:border-ink/25 hover:text-ink'
                    )}
                  >
                    {busy === c.key && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsLogin && (
            <p className="text-[12px] leading-snug text-muted">
              One vote per account keeps this count honest.{' '}
              <Link to="/login" className="font-semibold text-primary hover:underline">Log in to vote</Link>.
            </p>
          )}
          {err && <p className="text-[12px] leading-snug text-danger">{err}</p>}

          {/* Measured count. Target is named as a target on the same line. */}
          <div>
            <div className="flex items-end justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Votes so far</p>
              {total === null ? (
                <p className="text-[12px] font-medium text-muted">Not measured</p>
              ) : (
                <p className="font-display text-[13px] font-bold text-ink nums">
                  {grouped(total)}
                  {target !== null && (
                    <span className="font-medium text-muted"> / {grouped(target)} target</span>
                  )}
                </p>
              )}
            </div>
            {pct !== null && (
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={total}
                aria-label={`${grouped(total)} of a ${grouped(target)} vote target`}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            )}
            {/* The split is shown after voting, so a leading side cannot steer the vote. */}
            {myVote && yes !== null && no !== null && (
              <p className="mt-1.5 text-[11px] text-muted nums">
                Yes {grouped(yes)} · No {grouped(no)}
              </p>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted/90">
            {poll.disclosure || 'Not open for entries. This vote only decides whether the tournament gets built.'}
          </p>
        </div>
      </div>
    </article>
  );
}

/* ── Carousel ──────────────────────────────────────────────────────────── */
export default function PollBanners() {
  const [polls, setPolls] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const scroller = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    fn('pollList')
      .then((d) => { if (alive) setPolls(readPolls(d)); })
      .catch(() => { if (alive) { setPolls([]); setFailed(true); } });
    return () => { alive = false; };
  }, []);

  const patch = useCallback((slug, fields) => {
    setPolls((cur) => (cur || []).map((p) => (p.slug === slug ? { ...p, ...fields } : p)));
  }, []);

  // Active slide = whichever slide sits closest to the scroller's left edge.
  // Measured from the DOM rather than tracked in state, so a swipe, a keypress
  // and a dot click all agree on the answer.
  const syncActive = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    let best = 0;
    let bestD = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const d = Math.abs(child.offsetLeft - el.scrollLeft);
      if (d < bestD) { bestD = d; best = i; }
    });
    setActive(best);
  }, []);

  const goTo = useCallback((i) => {
    const el = scroller.current;
    if (!el) return;
    const child = el.children[Math.max(0, Math.min(el.children.length - 1, i))];
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  }, [reduce]);

  function onKeyDown(e) {
    // Only when the strip itself holds focus — arrow keys inside a Yes/No
    // button belong to the button, not to the carousel.
    if (e.target !== e.currentTarget) return;
    const n = (polls || []).length;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min(n - 1, active + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.max(0, active - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(n - 1); }
  }

  if (polls === null) {
    return (
      <section className="shell py-12 sm:py-14" aria-busy="true">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="mt-3 h-8 w-72 rounded" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={cn('h-[420px] rounded-xl', i === 1 && 'hidden sm:block', i === 2 && 'hidden lg:block')} />
          ))}
        </div>
      </section>
    );
  }

  // Nothing to show is not an error worth a headline; a failed fetch gets one
  // quiet line. Neither state ever renders a stand-in banner.
  if (!polls.length) {
    if (!failed) return null;
    return (
      <section className="shell py-10">
        <p className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-4 py-3 text-[13px] text-muted">
          Upcoming community polls could not be loaded right now.
        </p>
      </section>
    );
  }

  const n = polls.length;
  const controls = n > 1;

  return (
    <section className="shell py-12 sm:py-14" aria-labelledby="polls-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Vote className="h-3.5 w-3.5" aria-hidden="true" /> Community vote
          </p>
          <h2 id="polls-heading" className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            Tournaments we are considering
          </h2>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
            None of these are running. They are not open for entries and there is nothing to claim —
            creators vote on which tournament RazeKit should build next.
          </p>
        </div>

        {controls && (
          <div className={cn('hidden items-center gap-2 sm:flex', n <= 3 && 'lg:hidden')}>
            <button type="button" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous poll"
              className="grid h-10 w-10 place-items-center rounded-md border border-line-strong bg-surface text-muted transition-colors hover:text-ink hover:border-ink/25 disabled:opacity-40 disabled:pointer-events-none">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => goTo(active + 1)} disabled={active >= n - 1} aria-label="Next poll"
              className="grid h-10 w-10 place-items-center rounded-md border border-line-strong bg-surface text-muted transition-colors hover:text-ink hover:border-ink/25 disabled:opacity-40 disabled:pointer-events-none">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <div
        ref={scroller}
        onScroll={syncActive}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Upcoming community polls"
        className="no-scrollbar relative mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-bg"
      >
        {polls.map((p, i) => (
          <div
            key={p.slug}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}: ${p.title}`}
            className="shrink-0 grow-0 basis-full snap-start sm:basis-[calc((100%_-_16px)/2)] lg:basis-[calc((100%_-_32px)/3)]"
          >
            <PollBanner poll={p} onVoted={patch} />
          </div>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">Poll {active + 1} of {n}</p>

      {controls && (
        <div className={cn('mt-4 flex items-center justify-center gap-3 sm:hidden')}>
          <button type="button" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous poll"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line-strong bg-surface text-muted disabled:opacity-40 disabled:pointer-events-none">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {/* The visible dot is 6px; the button around it is 44px, because the
              thumb has to hit the button, not the dot. Wraps rather than
              pushing the row past a 360px screen when there are many polls. */}
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-y-0">
            {polls.map((p, i) => (
              <button key={p.slug} type="button" onClick={() => goTo(i)} aria-label={`Show poll ${i + 1}`} aria-current={i === active}
                className="group grid h-11 w-6 shrink-0 place-items-center rounded-md">
                <span aria-hidden="true" className={cn('h-1.5 rounded-full transition-all duration-base ease-brand',
                  i === active ? 'w-5 bg-primary' : 'w-1.5 bg-line-strong group-hover:bg-muted')} />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => goTo(active + 1)} disabled={active >= n - 1} aria-label="Next poll"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line-strong bg-surface text-muted disabled:opacity-40 disabled:pointer-events-none">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
