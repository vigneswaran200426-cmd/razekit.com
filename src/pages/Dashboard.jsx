// DASHBOARD — the operational home. Not a feed, not a showcase: the two or
// three things this person has to do next, and the numbers that tell them
// whether anything is going wrong.
//
// It is role-aware because a creator and a brand are running different
// businesses on the same platform. A creator asks: what have I entered, what
// closes next, what have I won, what am I owed. A brand asks: which campaign
// is live, has it been funded, what has come in, what closes next.
//
// Everything here is read-only and derived from what the server returned. Where
// a source fails to load, its metric reads "Not measured" and its section says
// so — a failed request is never drawn as a zero, because "no submissions" and
// "we could not load your submissions" are different sentences, and only one of
// them should make someone relax.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Plus, Wallet as WalletIcon } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, moneyMinor } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader, Button, Badge, EmptyState, Skeleton, Metric } from '@/components/ui';
import CampaignCarousel from '@/components/CampaignCarousel';
import { ContestRow, RowSkeletons, ErrorState, StripSkeleton, hoursLeft } from '@/pages/Discover';

const CREATOR_ACTIVE = ['open', 'joined', 'working', 'submitted', 'reviewing'];
const CLIENT_CLOSED = ['draft', 'completed', 'winner_selected'];

// Funding states, read from the same vocabulary the server writes. Split by who
// has to move next, because "we are checking your transfer" and "we need your
// money" are the opposite message to a brand, and showing one as the other is
// how someone pays twice.
const FUNDING_NEEDS_BRAND = ['FUNDING_REQUIRED', 'PAYMENT_INSTRUCTIONS_SHOWN', 'REJECTED', 'NEEDS_INFORMATION', 'PARTIAL'];
const FUNDING_IN_REVIEW = ['TRANSFER_REPORTED', 'PENDING_VERIFICATION'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const byDeadline = (a, b) => (Date.parse(a.deadline || 0) || Infinity) - (Date.parse(b.deadline || 0) || Infinity);

/* ── Layout pieces ────────────────────────────────────────────────────────── */

function Section({ title, description, to, linkLabel = 'View all', children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {to && (
          <Link
            to={to}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-md px-1 text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {linkLabel}
          </Link>
        )}
      </div>
      {description && <p className="-mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
      {children}
    </section>
  );
}

/* A strip of counts. Counts only — a long currency value at this size breaks
   the grid on a 360px screen, so money gets its own full-width row. */
function CountStrip({ items, loading, columns = 'grid-cols-3' }) {
  return (
    <section aria-label="Summary" className={cn('grid divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface', columns)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 px-3 py-3 sm:px-4">
          {loading ? <StripSkeleton label={it.label} /> : <Metric label={it.label} value={it.value} hint={it.hint} tone={it.tone} />}
        </div>
      ))}
    </section>
  );
}

/* One thing to do, and the one control that does it. */
function ActionRow({ title, detail, to, cta, tone = 'neutral', badge }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-display text-[15px] font-bold text-ink">{title}</h3>
          {badge && <Badge tone={tone}>{badge}</Badge>}
        </div>
        {detail && <p className="mt-1 text-[13px] leading-relaxed text-muted">{detail}</p>}
      </div>
      <Button to={to} variant="secondary" className="h-11 shrink-0 sm:w-auto">{cta}</Button>
    </li>
  );
}

/* ── Creator ──────────────────────────────────────────────────────────────── */

function CreatorHome({ data, user, onRetry }) {
  const { contests, subs, wallet, failed } = data;

  const enteredIds = new Set(subs.map((s) => s.contest_id));
  const subByContest = new Map(subs.map((s) => [s.contest_id, s]));
  const mine = contests.filter((c) => enteredIds.has(c.id));
  const active = mine.filter((c) => CREATOR_ACTIVE.includes(c.status)).sort(byDeadline);
  const wins = contests.filter((c) => c.winner_user_id === user.id);
  const openBriefs = contests.filter((c) => c.status === 'open' && !enteredIds.has(c.id)).sort(byDeadline);

  // Same rule the balance screen uses: major units if present, minor units
  // otherwise — and nothing at all rather than a fabricated zero when neither
  // field is there.
  const earnings = !wallet
    ? null
    : wallet.available_balance != null
      ? money(wallet.available_balance, wallet.currency)
      : wallet.available_balance_minor != null
        ? moneyMinor(wallet.available_balance_minor, wallet.currency)
        : null;

  const bothLoaded = !failed.contests && !failed.subs;

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <Metric
          label="Available earnings"
          value={failed.wallet ? null : earnings}
          hint={failed.wallet ? 'We couldn’t load your balance' : earnings ? 'RazeKit balance' : 'No balance recorded yet'}
        />
        <Button to="/balance" variant="secondary" className="h-11 shrink-0">
          <WalletIcon className="h-4 w-4" aria-hidden="true" />View balance
        </Button>
      </div>

      <CountStrip
        items={[
          { label: 'Active entries', value: bothLoaded ? active.length : null },
          { label: 'Submissions', value: failed.subs ? null : subs.length },
          { label: 'Wins', value: failed.contests ? null : wins.length },
        ]}
      />

      <Section title="Closing next" description="Contests you have entered, soonest deadline first." to="/work" linkLabel="My work">
        {failed.contests || failed.subs ? (
          <ErrorState message="We couldn’t load your entries just now." onRetry={onRetry} />
        ) : active.length ? (
          <ul className="space-y-3">
            {active.slice(0, 4).map((c) => {
              const s = subByContest.get(c.id);
              const left = hoursLeft(c);
              return (
                <ContestRow
                  key={c.id}
                  contest={c}
                  entered
                  note={
                    s?.status
                      ? `Your entry: ${humanize(s.status)}`
                      : left !== null && left > 0
                        ? 'Not submitted yet'
                        : 'Deadline passed'
                  }
                />
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Compass}
            title="No contests in progress"
            description="Enter an open brief and it will appear here with its deadline and your entry status."
            action={<Button to="/discover" className="h-11">Find a brief</Button>}
          />
        )}
      </Section>

      {!failed.contests && wins.length > 0 && (
        <Section title="Your wins" to="/track-record" linkLabel="Track record">
          <ul className="space-y-3">
            {wins.slice(0, 3).map((c) => (
              <ContestRow key={c.id} contest={c} note={`Won · ${money(c.prize_amount, c.currency)} prize`} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Open briefs" description="Prize-funded briefs you have not entered yet." to="/discover" linkLabel="Discover">
        {failed.contests ? (
          <ErrorState message="We couldn’t load open briefs just now." onRetry={onRetry} />
        ) : openBriefs.length ? (
          <ul className="space-y-3">
            {openBriefs.slice(0, 3).map((c) => <ContestRow key={c.id} contest={c} />)}
          </ul>
        ) : (
          <EmptyState
            icon={Compass}
            title="Nothing new to enter right now"
            description="New briefs land in Discover as brands publish them."
            action={<Button to="/winners" variant="secondary" className="h-11">See past winners</Button>}
          />
        )}
      </Section>
    </>
  );
}

/* ── Client ───────────────────────────────────────────────────────────────── */

function ClientHome({ data, user, onRetry }) {
  const { contests, subs, failed } = data;

  const mine = contests.filter((c) => c.created_by_id === user.id);
  const active = mine.filter((c) => !CLIENT_CLOSED.includes(c.status)).sort(byDeadline);
  const drafts = mine.filter((c) => c.status === 'draft');
  const decided = mine.filter((c) => ['winner_selected', 'completed'].includes(c.status));
  const unfunded = mine.filter((c) => c.status !== 'draft' && c.funding_status && c.funding_status !== 'FUNDED');
  const judging = mine.filter((c) => ['submitted', 'reviewing'].includes(c.status));

  const todo = [
    ...unfunded.map((c) => ({
      key: `fund-${c.id}`,
      title: c.title,
      detail: `Funding status: ${humanize(c.funding_status)}. Creators can see the brief, but the prize is not confirmed until funding is verified.`,
      to: `/contest/${c.id}/fund`,
      cta: 'Fund contest',
      badge: 'Funding',
      tone: 'warning',
    })),
    ...judging.map((c) => ({
      key: `review-${c.id}`,
      title: c.title,
      detail: 'Entries are in. Scores are computed server-side — pick the winner from the ranked entries.',
      to: `/contest/${c.id}/review`,
      cta: 'Review entries',
      badge: 'Judging',
      tone: 'primary',
    })),
    ...drafts.map((c) => ({
      key: `draft-${c.id}`,
      title: c.title,
      detail: 'This brief is still a draft. Creators cannot see it yet.',
      to: `/contest/${c.id}`,
      cta: 'Open draft',
      badge: 'Draft',
      tone: 'neutral',
    })),
  ];

  if (failed.contests) {
    return (
      <>
        <CountStrip
          columns="grid-cols-2 sm:grid-cols-4"
          items={[
            { label: 'Active campaigns', value: null },
            { label: 'Entries received', value: failed.subs ? null : subs.length },
            { label: 'Needs funding', value: null },
            { label: 'Winners picked', value: null },
          ]}
        />
        <ErrorState title="We couldn’t load your campaigns" message="Your campaigns are safe — this is a display problem. Try again." onRetry={onRetry} />
      </>
    );
  }

  return (
    <>
      <CountStrip
        columns="grid-cols-2 sm:grid-cols-4"
        items={[
          { label: 'Active campaigns', value: active.length },
          { label: 'Entries received', value: failed.subs ? null : subs.length },
          { label: 'Needs funding', value: unfunded.length },
          { label: 'Winners picked', value: decided.length },
        ]}
      />

      {mine.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No campaigns yet"
          description="Publish a brief with a prize and a deadline, and creators can start entering. You pick the winner once entries are judged."
          action={<Button to="/create-contest" className="h-11">Create your first contest</Button>}
        />
      ) : (
        <>
          <Section
            title="Needs your attention"
            description={todo.length ? undefined : 'Nothing is waiting on you right now.'}
          >
            {todo.length ? (
              <ul className="space-y-3">
                {todo.slice(0, 5).map((t) => <ActionRow {...t} key={t.key} />)}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-6 text-center text-[13px] text-muted">
                Every live campaign is funded and nothing is waiting to be judged.
              </div>
            )}
          </Section>

          <Section title="Closing next" description="Live campaigns, soonest deadline first." to="/work" linkLabel="My contests">
            {active.length ? (
              <ul className="space-y-3">
                {active.slice(0, 4).map((c) => (
                  <ContestRow key={c.id} contest={c} note={`Status: ${humanize(c.status)}`} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Compass}
                title="No live campaigns"
                description="Publish a brief and it will show up here with its deadline."
                action={<Button to="/create-contest" className="h-11"><Plus className="h-4 w-4" aria-hidden="true" />New contest</Button>}
              />
            )}
          </Section>

          {failed.subs && (
            <ErrorState title="We couldn’t load entries" message="Your campaign list is current, but the entry count above is unavailable." onRetry={onRetry} />
          )}
        </>
      )}
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { user, role } = useAuth();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setData(null);
    const uid = user.id;
    const isClient = role === 'client';
    // Settled, not caught: a rejection has to stay distinguishable from an
    // empty list all the way to the screen.
    const [c, s, w] = await Promise.allSettled([
      entities.Contest.list('-created_date', 100),
      isClient
        ? entities.Submission.filter({ client_id: uid }, '-created_date', 100)
        : entities.Submission.filter({ created_by_id: uid }, '-created_date', 100),
      entities.Wallet.filter({ user_id: uid }, '-created_date', 1),
    ]);
    setData({
      contests: c.status === 'fulfilled' ? (c.value || []) : [],
      subs: s.status === 'fulfilled' ? (s.value || []) : [],
      wallet: w.status === 'fulfilled' ? ((w.value || [])[0] || null) : null,
      failed: {
        contests: c.status !== 'fulfilled',
        subs: s.status !== 'fulfilled',
        wallet: w.status !== 'fulfilled',
      },
    });
  }, [user?.id, role]);

  useEffect(() => { load(); }, [load]);

  const firstName = (user?.full_name || user?.email?.split('@')[0] || 'there').split(' ')[0];
  const isClient = role === 'client';
  const eyebrow = isClient ? 'Brand' : role === 'admin' ? 'Admin' : 'Creator';

  const header = (
    <PageHeader
      eyebrow={eyebrow}
      title={`${greeting()}, ${firstName}`}
      description={isClient ? 'Your campaigns, and what is waiting on you.' : 'What you have entered, what closes next, and what you have earned.'}
      actions={isClient ? <Button to="/create-contest" className="h-11"><Plus className="h-4 w-4" aria-hidden="true" />New contest</Button> : undefined}
    />
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {['', '', ''].map((_, i) => (
            <div key={i} className="min-w-0 px-3 py-3 sm:px-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-6 w-12" /></div>
          ))}
        </div>
        <RowSkeletons count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* The featured-campaign module is a creator-facing call to enter, so it
          only appears for the side of the market it speaks to. */}
      {!isClient && <CampaignCarousel />}
      {header}
      {isClient
        ? <ClientHome data={data} user={user} onRetry={load} />
        : <CreatorHome data={data} user={user} onRetry={load} />}
    </div>
  );
}
