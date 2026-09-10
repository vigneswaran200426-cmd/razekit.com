// RazeKit — Creator track record (route /track-record).
//
// A creator's own competitive history. It is a record, not a highlight reel:
// losses and disqualifications sit in the same list as wins, and a rate that
// cannot be computed yet says so instead of showing 0%.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy, TrendingUp, Target, AlertCircle, Lock, Ban, History, Wallet, Clock,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { money, moneyMinor, dateShort } from '@/lib/format';
import { Card, Button, Badge, Skeleton, EmptyState, Segmented } from '@/components/ui';
import { cn } from '@/lib/cn';

const nf = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN') : null);
const dec = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1) : null);

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function Stat({ label, value, unavailable, sub, icon: Icon, accent }) {
  const missing = value === null || value === undefined;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4', accent ? 'text-primary' : 'text-muted/70')} aria-hidden="true" />}
      </div>
      {missing ? (
        <p className="mt-2 text-[13px] font-medium leading-snug text-muted">{unavailable || 'No results yet'}</p>
      ) : (
        <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-ink nums">{value}</p>
      )}
      {sub && !missing && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </Card>
  );
}

function Metric({ label, value }) {
  const shown = dec(value);
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="font-display text-[14px] font-bold text-ink nums">
        {shown ?? <span className="text-[12px] font-medium text-muted">n/a</span>}
      </span>
    </span>
  );
}

function HistoryRow({ r }) {
  const scored = typeof r.final_score === 'number' && Number.isFinite(r.final_score);
  return (
    <li className={cn('border-b border-line py-4 last:border-0', r.is_winner && 'bg-primary/[0.04]')}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.contest_id ? (
              <Link to={`/contest/${r.contest_id}`} className="truncate font-display text-[15px] font-bold text-ink underline-offset-2 hover:text-primary hover:underline">
                {r.contest_title || 'Untitled campaign'}
              </Link>
            ) : (
              <span className="truncate font-display text-[15px] font-bold text-ink">{r.contest_title || 'Untitled campaign'}</span>
            )}
            {r.is_winner && (
              <Badge tone="primary">
                <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" aria-hidden="true" />Won</span>
              </Badge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {r.brand_name && <span className="font-medium text-ink/80">{r.brand_name}</span>}
            {r.category && <><span aria-hidden="true">·</span><span className="capitalize">{r.category}</span></>}
            {r.finalized_at && <><span aria-hidden="true">·</span><span>{dateShort(r.finalized_at)}</span></>}
            {r.rank !== null && r.rank !== undefined && <><span aria-hidden="true">·</span><span className="nums">Rank {r.rank}</span></>}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Final</p>
          <p className="font-display text-xl font-extrabold text-ink nums">
            {scored ? r.final_score.toFixed(1) : <span className="text-[13px] font-medium text-muted">Not scored</span>}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Metric label="Engage" value={r.engagement_score} />
        <Metric label="Traffic" value={r.traffic_score} />
        {r.is_winner && r.prize_amount !== null && r.prize_amount !== undefined && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Prize</span>
            <span className="font-display text-[14px] font-bold text-success nums">{money(r.prize_amount, r.currency)}</span>
          </span>
        )}
      </div>
    </li>
  );
}

function Earnings({ earnings, currency }) {
  const nothing = !earnings.payouts_paid && !earnings.payouts_pending && !earnings.prizes_won_minor;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Prize money
        </h2>
        <Badge tone="neutral">Only you can see this</Badge>
      </div>

      {nothing ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          No prize payment has been recorded for you yet. Prize money appears here once a campaign you won has been paid.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Received</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink nums">{moneyMinor(earnings.prizes_won_minor, currency)}</p>
            <p className="mt-0.5 text-[11px] text-muted">Across {nf(earnings.payouts_paid) ?? '0'} paid {earnings.payouts_paid === 1 ? 'payment' : 'payments'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Payments made</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink nums">{nf(earnings.payouts_paid) ?? '0'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Not yet paid</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink nums">{nf(earnings.payouts_pending) ?? '0'}</p>
            {earnings.payouts_pending > 0 && <p className="mt-0.5 text-[11px] text-muted">Still being processed</p>}
          </div>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
        <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Prize payments are made by a person after the win is verified. They are not automatic, not instant and not guaranteed by RazeKit.
      </p>
    </Card>
  );
}

/* ── States ───────────────────────────────────────────────────────────────── */

function LoadingRecord() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your track record</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] w-full" />)}
      </div>
      <Skeleton className="h-[168px] w-full" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] w-full" />)}
      </div>
    </div>
  );
}

function Failure({ status, message }) {
  const unauth = status === 401;
  const forbidden = status === 403;
  const Icon = unauth || forbidden ? Lock : AlertCircle;
  return (
    <Card className="p-6 sm:p-8" role="alert">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-md bg-surface-2 text-muted">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="font-display text-lg font-extrabold text-ink">
          {unauth ? 'Sign in to see your track record'
            : forbidden ? 'This record is not yours to view'
            : 'Your track record could not be loaded'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{message || 'Something went wrong on our side. Try again in a moment.'}</p>
        <div className="mt-5 flex justify-center">
          {unauth ? <Button to="/login" size="sm">Sign in</Button>
            : <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>Try again</Button>}
        </div>
      </div>
    </Card>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function TrackRecord() {
  const [data, setData] = useState(null);
  const [fail, setFail] = useState(null);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let live = true;
    fn('creatorTrackRecord', {})
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setFail({ status: e?.status, message: e?.data?.error?.message || e?.message }); });
    return () => { live = false; };
  }, []);

  const history = data?.history || [];
  const rows = useMemo(() => (tab === 'wins' ? history.filter((h) => h.is_winner) : history), [history, tab]);
  const currency = history.find((h) => h.currency)?.currency || 'INR';

  if (fail) {
    return <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10"><Failure status={fail.status} message={fail.message} /></div>;
  }

  if (!data) {
    return <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10"><LoadingRecord /></div>;
  }

  const t = data.totals;
  const a = data.averages;
  const noResults = t.contests_completed === 0;

  // The headline is written from real counts, so it can never overstate.
  const headline = noResults
    ? (t.contests_entered > 0
      ? `${nf(t.contests_entered)} ${t.contests_entered === 1 ? 'contest entered' : 'contests entered'}, no results yet`
      : 'No contests entered yet')
    : t.wins > 0
      ? `${nf(t.wins)} ${t.wins === 1 ? 'win' : 'wins'} from ${nf(t.contests_completed)} finished ${t.contests_completed === 1 ? 'contest' : 'contests'}`
      : `${nf(t.contests_completed)} finished ${t.contests_completed === 1 ? 'contest' : 'contests'}, no win yet`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="space-y-6 sm:space-y-8">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Track record</p>
          <h1 className="mt-2 font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">{headline}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
            Your complete competitive history on RazeKit — every finished contest, scored the same way, in the order it was finalised.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Wins" value={nf(t.wins)} icon={Trophy} accent sub={t.wins > 0 ? 'Campaigns you took first place in' : 'No win recorded yet'} />
          <Stat
            label="Win rate"
            value={t.win_rate === null || t.win_rate === undefined ? null : `${t.win_rate}%`}
            unavailable="No results yet"
            sub={`Of ${nf(t.contests_completed) ?? '0'} finished`}
            icon={Target}
          />
          <Stat
            label="Avg final score"
            value={dec(a.final_score)}
            unavailable="Nothing scored yet"
            sub="Across scored entries"
            icon={TrendingUp}
          />
          <Stat label="Best score" value={dec(a.best_final_score)} unavailable="Nothing scored yet" sub="Your highest final score" icon={Trophy} />
        </div>

        <Card className="p-5 sm:p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">The full count</h2>
          <dl className="mt-3">
            {[
              ['Contests entered', nf(t.contests_entered) ?? '0', null],
              ['Contests finished', nf(t.contests_completed) ?? '0', null],
              ['Average video engagement', dec(a.engagement), 'Not scored yet'],
              ['Average brand traffic', dec(a.traffic), 'Not scored yet'],
              ['Disqualified entries', nf(t.disqualified) ?? '0', null],
            ].map(([label, value, fallback]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-0">
                <dt className="text-[13px] text-muted">{label}</dt>
                <dd className="font-display text-[15px] font-bold text-ink nums">
                  {value ?? <span className="text-[13px] font-medium text-muted">{fallback || 'Not available'}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {t.disqualified > 0 && (
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              A disqualified entry is excluded from scoring. It is shown here because your record is only meaningful if it is complete.
            </p>
          )}
        </Card>

        {data.is_self && data.earnings && <Earnings earnings={data.earnings} currency={currency} />}

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-1.5 font-display text-lg font-extrabold tracking-tight text-ink">
              <History className="h-4 w-4 text-muted" aria-hidden="true" /> History
            </h2>
            {history.length > 0 && (
              <Segmented
                size="sm"
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'all', label: `All ${history.length}` },
                  { key: 'wins', label: `Wins ${t.wins}` },
                ]}
              />
            )}
          </div>

          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title={t.contests_entered > 0 ? 'No finished contests yet' : 'Your history starts with your first entry'}
              description={
                t.contests_entered > 0
                  ? 'You have entered but nothing has been finalised. A contest appears here once its scoring is complete.'
                  : 'Enter a contest, publish your work, and the result will be recorded here — win or not.'
              }
              action={<Button to="/explore" size="sm">Find a contest</Button>}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No wins recorded yet"
              description="You have finished contests, but none of them is a win so far. Switch back to All to see the full record."
              action={<Button variant="secondary" size="sm" onClick={() => setTab('all')}>Show all contests</Button>}
            />
          ) : (
            <Card className="px-5 sm:px-6">
              <ol>{rows.map((r, i) => <HistoryRow key={`${r.contest_id || 'row'}-${i}`} r={r} />)}</ol>
            </Card>
          )}

          {history.length >= 50 && (
            <p className="mt-3 text-[12px] text-muted">Showing your 50 most recent finished contests.</p>
          )}
        </section>

        <footer className="border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
          <p className="flex items-start gap-1.5">
            <Ban className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Every score here was produced by RazeKit's scoring engine from verified activity. Nothing is estimated, and no figure is filled in when data is missing.
          </p>
          <p className="mt-2">Updated {dateShort(data.generated_at)}</p>
        </footer>
      </div>
    </div>
  );
}
