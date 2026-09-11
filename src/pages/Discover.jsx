// DISCOVER — the creator's brief marketplace.
//
// This page answers one question: which open brief is worth my next week of
// work? So it leads with the three facts that decide that — prize, deadline,
// requirements — and puts them in the same place on every row, at 360px and at
// 1440px. It is deliberately a LIST rather than a gallery: a creator compares
// briefs against each other, and the cover art is the least comparable thing
// about them. (Explore is the brand-side surface, and looks nothing like this.)
//
// It refuses to show an entry count, a "hot" badge, or any popularity signal:
// none of those are measured for an open contest, and an invented one would
// change which brief a creator spends a week on. Every number here is either a
// field the server returned or a count of the rows it returned.
//
// The small discovery kit at the top of this file (list states, option lists,
// search, contest row) is shared with Dashboard and Explore. It lives here
// rather than in src/components only because this pass owns exactly three
// files; it is written to be moved out unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Clock, Compass, Search, SlidersHorizontal, X } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, timeLeft } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader, Button, Badge, Input, EmptyState, Skeleton, Sheet, Metric } from '@/components/ui';

/* ══ Shared discovery kit ══════════════════════════════════════════════════ */

/* A failed load is not an empty shelf, and must never be drawn as one — an
   empty list says "there is nothing", an error says "we don't know". They are
   different claims, so they get different surfaces and only one of them offers
   a retry. */
export function ErrorState({ title = 'We couldn’t load this', message, onRetry, className }) {
  return (
    <div role="alert" className={cn('rounded-lg border border-danger/30 bg-surface px-5 py-8 text-center', className)}>
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">
        {message || 'Something went wrong on our side. Nothing was lost — try again.'}
      </p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" className="h-11" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

/* One switch for the four states every list on these pages can be in, so no
   screen can accidentally ship three of them and forget the fourth. */
export function ListState({ status, loading, error, onRetry, empty, children }) {
  if (status === 'loading') return loading ?? null;
  if (status === 'error') return <ErrorState message={error} onRetry={onRetry} />;
  if (status === 'empty') return empty ?? null;
  return children;
}

/* Search that can be cleared with one thumb. The label is real, not a
   placeholder pretending to be one. */
export function SearchField({ id, value, onChange, label, placeholder }) {
  return (
    <div className="relative flex-1 min-w-0">
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-11 pl-9 pr-11" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* A single-select filter group as a full-width vertical list.
   Chips that wrap into a ragged block are hard to hit and harder to scan; a
   list gives every option the same 44px target on a phone and reads like an
   index on a desktop. The count beside each option is a real count of matching
   rows — an option that would return nothing says so rather than lying. */
export function OptionList({ legend, options, value, onChange, className }) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{legend}</legend>
      <div className="-mx-2">
        {options.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.key)}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
                active ? 'bg-surface-2 font-semibold text-ink' : 'text-muted hover:text-ink'
              )}
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'text-transparent')} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.count != null && <span className="nums shrink-0 text-[11px] tabular-nums text-muted">{o.count}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* The small-screen way into a filter panel that is a rail on a wide screen.
   The count is announced, not just drawn, so the state of the filters is
   available without seeing the badge. */
export function FilterButton({ count = 0, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors',
        'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg lg:hidden',
        className
      )}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      Filters
      {count > 0 && (
        <span className="nums grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{count}</span>
      )}
      <span className="sr-only">{count > 0 ? `${count} filters applied` : 'no filters applied'}</span>
    </button>
  );
}

/* Deterministic cover for a contest with no artwork — the same treatment the
   contest card and the winners showcase use, so one contest looks like itself
   wherever it appears. */
function cover(id = '') {
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 72% 48%))`;
}

export function hoursLeft(contest) {
  const t = Date.parse(contest?.deadline || '');
  return Number.isFinite(t) ? (t - Date.now()) / 3600000 : null;
}

/* The requirements a creator screens on before reading the brief. Only fields
   the contest actually carries — an absent requirement is simply not shown,
   never defaulted to something that sounds plausible. */
function requirements(c) {
  const out = [];
  if (c.required_platform) out.push(String(c.required_platform));
  const secs = Number(c.max_video_seconds);
  if (Number.isFinite(secs) && secs > 0) out.push(`Max ${secs}s`);
  else if (c.video_duration) out.push(String(c.video_duration));
  const winners = Number(c.number_of_winners || 1);
  if (winners > 1) out.push(`${winners} winners`);
  if (c.verified_creators_only) out.push('Verified only');
  const level = Number(c.minimum_creator_level || 1);
  if (level > 1) out.push(`Level ${level}+`);
  if (c.editing_style) out.push(String(c.editing_style));
  return out.slice(0, 4);
}

/* One brief as a row: cover, what it is, what it pays, when it closes.
   Flat by design — a row that nests cards inside cards stops being scannable
   at exactly the width where scanning matters most. */
export function ContestRow({ contest: c, entered, note }) {
  const left = hoursLeft(c);
  const ended = left !== null && left <= 0;
  const closingSoon = left !== null && left > 0 && left <= 48;
  const reqs = requirements(c);

  return (
    <li>
      <Link
        to={`/contest/${c.id}`}
        className="group flex gap-3 rounded-lg border border-line bg-surface p-3 shadow-xs transition-all duration-200 ease-brand hover:border-line-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:p-3.5"
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md sm:h-20 sm:w-20">
          {c.cover_image_url
            ? <img src={c.cover_image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <div className="h-full w-full" style={{ background: cover(c.id) }} aria-hidden="true" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {c.category && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.category}</span>}
            {entered && <Badge tone="success"><Check className="h-3 w-3" aria-hidden="true" />Entered</Badge>}
          </div>

          <h3 className="mt-1 line-clamp-2 font-display text-[15px] font-bold leading-snug text-ink transition-colors group-hover:text-primary sm:text-base">
            {c.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted">Prize</span>
              <span className="nums font-display text-[17px] font-extrabold leading-none text-ink tabular-nums">{money(c.prize_amount, c.currency)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[13px]">
              <Clock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              <span className={cn('nums font-semibold tabular-nums', ended ? 'text-muted' : 'text-ink')}>
                {ended ? 'Closed' : timeLeft(c.deadline)}
              </span>
              {closingSoon && <Badge tone="warning">Closing soon</Badge>}
            </span>
          </div>

          {reqs.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {reqs.map((r) => (
                <li key={r} className="rounded border border-line px-1.5 py-0.5 text-[11px] leading-4 text-muted">{r}</li>
              ))}
            </ul>
          )}

          {note && <p className="mt-2 text-[12px] leading-snug text-muted">{note}</p>}
        </div>
      </Link>
    </li>
  );
}

export function RowSkeleton() {
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-surface p-3 shadow-xs sm:p-3.5">
      <Skeleton className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-40" />
      </div>
    </li>
  );
}

/* A metric still loading is not a metric that is missing, so it gets a
   placeholder rather than the "Not measured" text — that text is reserved for
   an answer we actually have: there is no measurement. */
export function StripSkeleton({ label }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <Skeleton className="mt-1.5 h-6 w-12" />
    </div>
  );
}

export function RowSkeletons({ count = 6 }) {
  return <ul className="space-y-3">{Array.from({ length: count }).map((_, i) => <RowSkeleton key={i} />)}</ul>;
}

/* ══ Discover ══════════════════════════════════════════════════════════════ */

const LIMIT = 200;

const SORTS = [
  { key: 'ending', label: 'Ending soon' },
  { key: 'prize', label: 'Highest prize' },
  { key: 'newest', label: 'Newest' },
];

const TIMING = [
  { key: 'any', label: 'Any deadline' },
  { key: '48h', label: 'Closing in 48 hours' },
  { key: 'week', label: 'Closing this week' },
  { key: 'new', label: 'Opened this week' },
];

const BLANK = { q: '', cat: 'all', platform: 'all', timing: 'any', hideEntered: false };

function daysSince(c) {
  const t = Date.parse(c?.created_date || '');
  return Number.isFinite(t) ? (Date.now() - t) / 86400000 : null;
}

/* One predicate for the whole page. `skip` lets a filter group count its own
   options against everything EXCEPT itself, which is the only way those counts
   stay true while the other filters move. */
function matches(c, f, entered, skip) {
  if (skip !== 'q' && f.q) {
    const hay = `${c.title || ''} ${c.short_description || ''} ${c.category || ''} ${c.required_platform || ''}`.toLowerCase();
    if (!hay.includes(f.q.trim().toLowerCase())) return false;
  }
  if (skip !== 'cat' && f.cat !== 'all' && c.category !== f.cat) return false;
  if (skip !== 'platform' && f.platform !== 'all' && String(c.required_platform || '') !== f.platform) return false;
  if (skip !== 'timing' && f.timing !== 'any') {
    const left = hoursLeft(c);
    const age = daysSince(c);
    if (f.timing === '48h' && !(left !== null && left > 0 && left <= 48)) return false;
    if (f.timing === 'week' && !(left !== null && left > 0 && left <= 168)) return false;
    if (f.timing === 'new' && !(age !== null && age <= 7)) return false;
  }
  if (f.hideEntered && entered.has(c.id)) return false;
  return true;
}

function tally(list, key) {
  const out = new Map();
  for (const c of list) {
    const v = c[key];
    if (v) out.set(String(v), (out.get(String(v)) || 0) + 1);
  }
  return out;
}

/* Rendered twice — as a rail on a wide screen, inside a sheet on a phone — so
   the two never drift apart. */
function Filters({ filters, set, categories, platforms, timings, signedIn, onReset, dirty }) {
  return (
    <div className="space-y-5">
      <OptionList legend="Category" options={categories} value={filters.cat} onChange={(v) => set({ cat: v })} />
      {platforms.length > 1 && (
        <OptionList legend="Platform" options={platforms} value={filters.platform} onChange={(v) => set({ platform: v })} />
      )}
      <OptionList legend="Timing" options={timings} value={filters.timing} onChange={(v) => set({ timing: v })} />

      {signedIn && (
        <div>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={filters.hideEntered}
              onChange={(e) => set({ hideEntered: e.target.checked })}
              className="h-4 w-4 rounded border-line-strong text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            Hide briefs I’ve entered
          </label>
        </div>
      )}

      {dirty && (
        <Button variant="ghost" className="h-11 w-full justify-start px-2" onClick={onReset}>Clear all filters</Button>
      )}
    </div>
  );
}

export default function Discover() {
  const { user, status: authStatus } = useAuth();
  const [contests, setContests] = useState(null);
  const [error, setError] = useState(null);
  const [entered, setEntered] = useState(new Set());
  const [filters, setFilters] = useState(BLANK);
  const [sort, setSort] = useState('ending');
  const [sheet, setSheet] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setContests(null);
    entities.Contest.filter({ status: 'open' }, '-created_date', LIMIT)
      .then((rows) => setContests(rows || []))
      .catch(() => setError('We couldn’t load open briefs just now.'));
  }, []);

  useEffect(load, [load]);

  // Which briefs has this creator already entered? Drives the "Entered" mark.
  // A failure here is silent on purpose: it costs a badge, not the page.
  useEffect(() => {
    if (!user?.id) { setEntered(new Set()); return; }
    entities.Submission.filter({ created_by_id: user.id }, '-created_date', 200)
      .then((rows) => setEntered(new Set((rows || []).map((r) => r.contest_id))))
      .catch(() => {});
  }, [user?.id]);

  const set = useCallback((patch) => setFilters((f) => ({ ...f, ...patch })), []);
  const reset = useCallback(() => setFilters(BLANK), []);
  const dirty = filters.cat !== 'all' || filters.platform !== 'all' || filters.timing !== 'any' || filters.hideEntered;
  const activeCount = [filters.cat !== 'all', filters.platform !== 'all', filters.timing !== 'any', filters.hideEntered].filter(Boolean).length;

  const all = contests || [];

  const shown = useMemo(() => {
    const list = all.filter((c) => matches(c, filters, entered, null));
    if (sort === 'prize') list.sort((a, b) => Number(b.prize_amount || 0) - Number(a.prize_amount || 0));
    else if (sort === 'newest') list.sort((a, b) => Date.parse(b.created_date || 0) - Date.parse(a.created_date || 0));
    else list.sort((a, b) => (Date.parse(a.deadline || 0) || Infinity) - (Date.parse(b.deadline || 0) || Infinity));
    return list;
  }, [all, filters, entered, sort]);

  const categories = useMemo(() => {
    const base = all.filter((c) => matches(c, filters, entered, 'cat'));
    const counts = tally(base, 'category');
    return [
      { key: 'all', label: 'All categories', count: base.length },
      ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => ({ key: k, label: k, count: n })),
    ];
  }, [all, filters, entered]);

  const platforms = useMemo(() => {
    const base = all.filter((c) => matches(c, filters, entered, 'platform'));
    const counts = tally(base, 'required_platform');
    if (!counts.size) return [];
    return [
      { key: 'all', label: 'Any platform', count: base.length },
      ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => ({ key: k, label: k, count: n })),
    ];
  }, [all, filters, entered]);

  const timings = useMemo(() => {
    const base = all.filter((c) => matches(c, filters, entered, 'timing'));
    return TIMING.map((t) => ({
      ...t,
      count: base.filter((c) => matches(c, { ...filters, timing: t.key }, entered, null)).length,
    }));
  }, [all, filters, entered]);

  const listStatus = error ? 'error' : contests === null ? 'loading' : shown.length === 0 ? 'empty' : 'ready';
  const closingSoon = all.filter((c) => { const h = hoursLeft(c); return h !== null && h > 0 && h <= 48; }).length;
  const fresh = all.filter((c) => { const d = daysSince(c); return d !== null && d <= 7; }).length;
  const measured = !error && contests !== null;

  const filterPanel = (
    <Filters
      filters={filters}
      set={set}
      categories={categories}
      platforms={platforms}
      timings={timings}
      signedIn={authStatus === 'authenticated'}
      onReset={reset}
      dirty={dirty}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Discover"
        title="Briefs open for entry"
        description="Prize-funded briefs from real brands. Prize, deadline and requirements up front — before you spend a week on one."
      />

      {/* The page's own numbers, and only its own numbers: these are counts of
          the rows the server returned, not platform-wide statistics. */}
      <section aria-label="Open briefs at a glance" className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <div className="min-w-0 px-3 py-3 sm:px-4">
          {contests === null && !error
            ? <StripSkeleton label="Open briefs" />
            : <Metric label="Open briefs" value={measured ? all.length : null} hint={measured && all.length >= LIMIT ? `Newest ${LIMIT} shown` : undefined} />}
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          {contests === null && !error ? <StripSkeleton label="Closing soon" /> : <Metric label="Closing soon" value={measured ? closingSoon : null} />}
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          {contests === null && !error ? <StripSkeleton label="New this week" /> : <Metric label="New this week" value={measured ? fresh : null} />}
        </div>
      </section>

      {/* Search stays within thumb reach while the list scrolls under it. It
          clears the header by exactly the header's height, so nothing is ever
          trapped beneath the navigation. */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <SearchField
            id="discover-search"
            label="Search open briefs"
            placeholder="Search briefs, categories…"
            value={filters.q}
            onChange={(v) => set({ q: v })}
          />
          <FilterButton count={activeCount} onClick={() => setSheet(true)} />
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside aria-label="Filter briefs" className="hidden lg:sticky lg:top-[8.5rem] lg:block lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-1">
          {filterPanel}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-ink">
              {listStatus === 'ready' || listStatus === 'empty' ? (
                <>
                  <span className="nums tabular-nums">{shown.length}</span>{' '}
                  {shown.length === 1 ? 'brief' : 'briefs'}
                </>
              ) : 'Open briefs'}
            </h2>
            <div className="flex items-center gap-2">
              <label htmlFor="discover-sort" className="text-[13px] text-muted">Sort</label>
              <select
                id="discover-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-11 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <ListState
            status={listStatus}
            error={error}
            onRetry={load}
            loading={<RowSkeletons count={6} />}
            empty={
              <EmptyState
                icon={Compass}
                title={filters.q.trim() || dirty ? 'No briefs match those filters' : 'No open briefs right now'}
                description={
                  filters.q.trim() || dirty
                    ? 'Clear a filter or widen the search — the rest of the briefs are still open.'
                    : 'New prize-funded briefs land here as brands publish them. Winners shows what has already been judged.'
                }
                action={
                  filters.q.trim() || dirty
                    ? <Button variant="secondary" className="h-11" onClick={() => { reset(); set({ q: '' }); }}>Clear filters</Button>
                    : <Button variant="secondary" className="h-11" to="/winners">See past winners</Button>
                }
              />
            }
          >
            <ul className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0">
              {shown.map((c) => <ContestRow key={c.id} contest={c} entered={entered.has(c.id)} />)}
            </ul>
          </ListState>
        </div>
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        side="bottom"
        title="Filter briefs"
        description="Counts update as you choose."
        footer={
          <Button className="h-11 w-full" onClick={() => setSheet(false)}>
            Show {shown.length} {shown.length === 1 ? 'brief' : 'briefs'}
          </Button>
        }
      >
        {filterPanel}
      </Sheet>
    </div>
  );
}
