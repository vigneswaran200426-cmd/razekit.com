// EXPLORE — the brand's side of discovery: who could make this, and what does
// the work here actually look like?
//
// Discover is the creator's list of briefs to enter. Explore is the opposite
// surface and shares none of its information architecture: a searchable
// directory of creators, and a gallery of work creators have published. A
// brand arrives with a brief in mind and leaves with a shortlist.
//
// Two rules shape everything below:
//   1. It is a DIRECTORY, not a ranking. Winners already ranks creators by
//      finalized contest performance; repeating that here would turn a
//      shortlist into a leaderboard and bury everyone who has not won yet.
//      Performance is shown as an overlay on a profile, never as the order.
//   2. Self-authored profile text (bio, skills, tools) is presented as what it
//      is — a claim by the creator. The only numbers on this page come from
//      finalized contest results, and a creator with no finalized results
//      reads "Not measured", never zero.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Film, Image as ImageIcon, Search, Trophy, Users } from 'lucide-react';
import { entities, fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader, Button, Badge, Avatar, EmptyState, Skeleton, Sheet, Metric } from '@/components/ui';
import { ListState, SearchField, OptionList, FilterButton, StripSkeleton } from '@/pages/Discover';

const PROFILE_LIMIT = 200;
const WORK_LIMIT = 60;

const SORTS = [
  { key: 'newest', label: 'Newest profiles' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'wins', label: 'Most contest wins' },
  { key: 'score', label: 'Highest average score' },
];

const RECORD = [
  { key: 'any', label: 'Everyone' },
  { key: 'scored', label: 'Has finalized results' },
  { key: 'won', label: 'Has won a contest' },
];

/* Profile arrays arrive as arrays, JSON strings or comma-separated strings
   depending on how the profile was written. Read all three, invent none. */
function asList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try { const j = JSON.parse(s); return Array.isArray(j) ? j.filter(Boolean).map(String) : []; } catch { return []; }
    }
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/* A portfolio URL is typed by the creator, so it is treated as untrusted: only
   http(s) is ever turned into a link. */
function safeUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

const isBrandProfile = (p) => !!(p.company_name || p.industry || p.company_size || p.business_description);
const isHidden = (p) => p.profile_visibility && p.profile_visibility !== 'public';
const displayName = (p) => p.display_name || p.username || '';

/* ── Tabs ────────────────────────────────────────────────────────────────────
   Underlined, not pill-shaped: two lenses on one subject, not two filters.
   Selection is carried by the underline and aria-selected, never by colour
   alone.                                                                    */
function Tabs({ value, onChange, tabs }) {
  const ref = useRef(null);
  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.key === value);
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.key);
    ref.current?.querySelector(`#explore-tab-${next.key}`)?.focus();
  };
  return (
    <div ref={ref} role="tablist" aria-label="Explore" onKeyDown={onKey} className="flex gap-1 overflow-x-auto border-b border-line no-scrollbar">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            id={`explore-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`explore-panel-${t.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              'relative -mb-px min-h-[44px] shrink-0 border-b-2 px-3 text-[14px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              active ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Creator directory ─────────────────────────────────────────────────────── */

/* One creator as a row. The row opens a detail panel rather than navigating,
   because a brand builds a shortlist by comparing — and losing the list on
   every look costs more on a phone than anywhere else. */
function CreatorRow({ profile: p, perf, onOpen }) {
  const name = displayName(p) || 'Creator';
  const tags = [...asList(p.categories), ...asList(p.skills)].slice(0, 3);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="group flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3 text-left shadow-xs transition-all duration-200 ease-brand hover:border-line-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:p-3.5"
      >
        <Avatar name={name} src={p.avatar_url} size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15px] font-bold text-ink transition-colors group-hover:text-primary">{name}</h3>
          {p.username && <p className="truncate text-[12px] text-muted">@{p.username}</p>}
          {p.professional_title && <p className="mt-0.5 truncate text-[13px] text-ink/80">{p.professional_title}</p>}

          {tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t} className="max-w-[12rem] truncate rounded border border-line px-1.5 py-0.5 text-[11px] leading-4 text-muted">{t}</li>
              ))}
            </ul>
          )}

          {/* Track record in one honest line: what was finalized, or that
              nothing has been. */}
          <p className="mt-2 text-[12px] text-muted">
            {perf ? (
              <>
                <span className="nums font-semibold tabular-nums text-ink">{perf.wins}</span> {perf.wins === 1 ? 'win' : 'wins'}
                {' · '}
                <span className="nums tabular-nums">{perf.entries}</span> scored {perf.entries === 1 ? 'entry' : 'entries'}
                {perf.average_final_score != null && <> · avg <span className="nums tabular-nums">{perf.average_final_score}</span></>}
              </>
            ) : 'No finalized contest results yet'}
          </p>
        </div>
        {perf?.wins > 0 && <Badge tone="success" className="mt-0.5 shrink-0"><Trophy className="h-3 w-3" aria-hidden="true" />Winner</Badge>}
      </button>
    </li>
  );
}

function CreatorSkeletons({ count = 6 }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-xs sm:p-3.5">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2 max-w-[200px]" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* The detail panel: profile claims on top, finalized measurements below, and
   an unmistakable line between the two. */
function CreatorSheet({ entry, onClose }) {
  const p = entry?.profile;
  const perf = entry?.perf;
  const name = p ? (displayName(p) || 'Creator') : '';
  const portfolio = safeUrl(p?.portfolio_url || p?.website);
  const skills = asList(p?.skills);
  const tools = asList(p?.tools);
  const categories = asList(p?.categories);

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      side="right"
      title={name}
      description={p?.professional_title || (p?.username ? `@${p.username}` : undefined)}
      footer={
        p?.user_id && (
          <Button to={`/u/${p.user_id}`} className="h-11 w-full">
            Open full profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )
      }
    >
      {p && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Avatar name={name} src={p.avatar_url} size={52} />
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold text-ink">{name}</p>
              {p.username && <p className="truncate text-[13px] text-muted">@{p.username}</p>}
            </div>
          </div>

          {p.bio && <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink/85">{p.bio}</p>}

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Finalized contest record</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              From judged contests only. Nothing here comes from followers, views or likes.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
              <Metric label="Contest wins" value={perf ? perf.wins : null} />
              <Metric label="Scored entries" value={perf ? perf.entries : null} />
              <Metric label="Average final score" value={perf?.average_final_score ?? null} />
              <Metric label="Prize won" value={perf?.prize ? money(perf.prize, perf.currency || 'INR') : null} />
            </div>
          </section>

          {(skills.length > 0 || tools.length > 0 || categories.length > 0) && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Stated by the creator</h3>
              <div className="mt-2 space-y-2.5">
                {categories.length > 0 && <TagRow label="Categories" items={categories} />}
                {skills.length > 0 && <TagRow label="Skills" items={skills} />}
                {tools.length > 0 && <TagRow label="Tools" items={tools} />}
                {p.years_experience && (
                  <p className="text-[13px] text-ink/85"><span className="text-muted">Experience:</span> {p.years_experience}</p>
                )}
              </div>
            </section>
          )}

          {portfolio && (
            <a
              href={portfolio}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Portfolio <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}

function TagRow({ label, items }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {items.slice(0, 12).map((t) => (
          <li key={t} className="rounded border border-line px-1.5 py-0.5 text-[12px] leading-5 text-ink/80">{t}</li>
        ))}
      </ul>
    </div>
  );
}

/* ── Work gallery ──────────────────────────────────────────────────────────── */

const isVideo = (url) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url || ''));

/* A tile shows the work and who made it. No likes, no comments, no saves —
   this is a reference wall for a brand, not a feed to scroll. */
function WorkTile({ post }) {
  const to = post.author_id ? `/u/${post.author_id}` : null;
  const Wrapper = to ? Link : 'div';
  const props = to ? { to } : {};
  return (
    <li>
      <Wrapper
        {...props}
        className={cn(
          'group block overflow-hidden rounded-lg border border-line bg-surface shadow-xs transition-all duration-200 ease-brand',
          to && 'hover:border-line-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
        )}
      >
        <div className="relative aspect-[4/5] bg-surface-2">
          {post.media_url ? (
            isVideo(post.media_url) ? (
              <>
                <video src={post.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <Film className="h-3 w-3" aria-hidden="true" />Video
                </span>
              </>
            ) : (
              <img src={post.media_url} alt={post.title || ''} loading="lazy" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="hatch grid h-full w-full place-items-center text-muted">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">No media attached</span>
            </div>
          )}
        </div>
        <div className="p-3">
          {post.title && <h3 className="line-clamp-1 font-display text-[14px] font-bold text-ink">{post.title}</h3>}
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">
            {post.author_name || post.author_username || 'Creator'}
            {post.category ? ` · ${post.category}` : ''}
          </p>
        </div>
      </Wrapper>
    </li>
  );
}

function WorkSkeletons({ count = 8 }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
          <Skeleton className="aspect-[4/5] rounded-none" />
          <div className="space-y-2 p-3"><Skeleton className="h-3.5 w-4/5" /><Skeleton className="h-3 w-1/2" /></div>
        </li>
      ))}
    </ul>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function Explore() {
  const { role, status: authStatus } = useAuth();
  const [tab, setTab] = useState('creators');
  const [filterSheet, setFilterSheet] = useState(false);

  // Creators
  const [profiles, setProfiles] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [perf, setPerf] = useState(null);          // creator_id → finalized record
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [record, setRecord] = useState('any');
  const [sort, setSort] = useState('newest');
  const [open, setOpen] = useState(null);

  // Work
  const [posts, setPosts] = useState(null);
  const [postError, setPostError] = useState(null);
  const [workQ, setWorkQ] = useState('');
  const [workCat, setWorkCat] = useState('all');

  const loadCreators = useCallback(() => {
    setProfileError(null);
    setProfiles(null);
    entities.UserProfile.list('-created_date', PROFILE_LIMIT)
      .then((rows) => setProfiles(rows || []))
      .catch(() => setProfileError('We couldn’t load creator profiles just now.'));
    // The performance overlay is optional: if it fails, every creator reads
    // "Not measured" rather than the page failing or a zero appearing.
    fn('winnersLeaderboard', { limit: 100 })
      .then((d) => {
        const map = {};
        for (const r of d?.leaderboard || []) if (r.creator_id) map[r.creator_id] = r;
        setPerf(map);
      })
      .catch(() => setPerf({}));
  }, []);

  const loadWork = useCallback(() => {
    setPostError(null);
    setPosts(null);
    entities.Post.list('-created_date', WORK_LIMIT)
      .then((rows) => setPosts((rows || []).filter((p) => p.moderation_status !== 'removed' && p.status !== 'removed')))
      .catch(() => setPostError('We couldn’t load published work just now.'));
  }, []);

  useEffect(loadCreators, [loadCreators]);
  useEffect(() => { if (tab === 'work' && posts === null && !postError) loadWork(); }, [tab, posts, postError, loadWork]);

  /* Only creator profiles, only the ones meant to be public, only the ones
     with a name to show. A brand profile in a creator directory is noise. */
  const creators = useMemo(() => {
    const rows = (profiles || []).filter((p) => !isBrandProfile(p) && !isHidden(p) && displayName(p));
    return rows.map((p) => ({ profile: p, perf: (perf && p.user_id && perf[p.user_id]) || null }));
  }, [profiles, perf]);

  /* One predicate for the directory. `skip` lets a filter group count its own
     options against every other filter but itself, so a count never promises
     results the filter would then remove. */
  const creatorMatches = useCallback((e, skip) => {
    const p = e.profile;
    if (skip !== 'q' && q.trim()) {
      const hay = `${displayName(p)} ${p.username || ''} ${p.professional_title || ''} ${p.bio || ''} ${asList(p.skills).join(' ')} ${asList(p.tools).join(' ')} ${asList(p.categories).join(' ')}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    if (skip !== 'cat' && cat !== 'all' && !asList(p.categories).includes(cat)) return false;
    if (skip !== 'record') {
      if (record === 'scored' && !e.perf) return false;
      if (record === 'won' && !(e.perf?.wins > 0)) return false;
    }
    return true;
  }, [q, cat, record]);

  const shownCreators = useMemo(() => {
    const list = creators.filter((e) => creatorMatches(e, null));
    if (sort === 'name') list.sort((a, b) => displayName(a.profile).localeCompare(displayName(b.profile)));
    else if (sort === 'wins') list.sort((a, b) => (b.perf?.wins ?? -1) - (a.perf?.wins ?? -1));
    else if (sort === 'score') list.sort((a, b) => (b.perf?.average_final_score ?? -1) - (a.perf?.average_final_score ?? -1));
    return list;
  }, [creators, creatorMatches, sort]);

  const categoryOptions = useMemo(() => {
    const base = creators.filter((e) => creatorMatches(e, 'cat'));
    const counts = new Map();
    for (const e of base) for (const c of new Set(asList(e.profile.categories))) counts.set(c, (counts.get(c) || 0) + 1);
    return [
      { key: 'all', label: 'All categories', count: base.length },
      ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => ({ key: k, label: k, count: n })),
    ];
  }, [creators, creatorMatches]);

  const recordOptions = useMemo(() => {
    const base = creators.filter((e) => creatorMatches(e, 'record'));
    return RECORD.map((r) => ({
      ...r,
      count: r.key === 'any' ? base.length : base.filter((e) => (r.key === 'scored' ? !!e.perf : e.perf?.wins > 0)).length,
    }));
  }, [creators, creatorMatches]);

  const shownWork = useMemo(() => {
    return (posts || []).filter((p) => {
      if (workCat !== 'all' && p.category !== workCat) return false;
      if (workQ.trim()) {
        const hay = `${p.title || ''} ${p.caption || ''} ${p.body || ''} ${p.category || ''} ${p.author_name || ''} ${p.author_username || ''} ${p.software || ''} ${p.editing_style || ''}`.toLowerCase();
        if (!hay.includes(workQ.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [posts, workCat, workQ]);

  const workCategories = useMemo(() => {
    const counts = new Map();
    for (const p of posts || []) if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    return [
      { key: 'all', label: 'All categories', count: (posts || []).length },
      ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => ({ key: k, label: k, count: n })),
    ];
  }, [posts]);

  const creatorsLoading = profiles === null && !profileError;
  const creatorStatus = profileError ? 'error' : creatorsLoading ? 'loading' : shownCreators.length === 0 ? 'empty' : 'ready';
  const workStatus = postError ? 'error' : posts === null ? 'loading' : shownWork.length === 0 ? 'empty' : 'ready';
  const creatorsFiltered = !!q.trim() || cat !== 'all' || record !== 'any';
  const withRecord = creators.filter((e) => !!e.perf).length;
  const categoryCount = Math.max(0, categoryOptions.length - 1);

  // Defined once and placed twice — a rail on a wide screen, a sheet on a
  // phone — so the two can never drift apart.
  const creatorFilters = (
    <div className="space-y-5">
      <OptionList legend="Category" options={categoryOptions} value={cat} onChange={setCat} />
      <OptionList legend="Contest record" options={recordOptions} value={record} onChange={setRecord} />
      {(cat !== 'all' || record !== 'any') && (
        <Button variant="ghost" className="h-11 w-full justify-start px-2" onClick={() => { setCat('all'); setRecord('any'); }}>
          Clear all filters
        </Button>
      )}
    </div>
  );

  const workFilters = (
    <div className="space-y-5">
      <OptionList legend="Category" options={workCategories} value={workCat} onChange={setWorkCat} />
      {workCat !== 'all' && (
        <Button variant="ghost" className="h-11 w-full justify-start px-2" onClick={() => setWorkCat('all')}>Clear all filters</Button>
      )}
    </div>
  );

  const switchTab = (next) => { setFilterSheet(false); setTab(next); };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Explore"
        title="Creators and their work"
        description="Search the people who compete on RazeKit, and the work they publish. Contest results shown here come from judged contests — never from follower counts."
      />

      <section aria-label="Directory at a glance" className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <div className="min-w-0 px-3 py-3 sm:px-4">
          {creatorsLoading ? <StripSkeleton label="Creators" /> : <Metric label="Creators" value={profileError ? null : creators.length} />}
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          {creatorsLoading ? <StripSkeleton label="With results" /> : <Metric label="With results" value={profileError || !perf ? null : withRecord} />}
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          {creatorsLoading ? <StripSkeleton label="Categories" /> : <Metric label="Categories" value={profileError ? null : categoryCount} />}
        </div>
      </section>

      <Tabs
        value={tab}
        onChange={switchTab}
        tabs={[{ key: 'creators', label: 'Creators' }, { key: 'work', label: 'Published work' }]}
      />

      {tab === 'creators' ? (
        <div id="explore-panel-creators" role="tabpanel" aria-labelledby="explore-tab-creators" tabIndex={-1} className="space-y-4 focus:outline-none">
          <div className="flex items-center gap-2">
            <SearchField id="explore-creator-search" label="Search creators" placeholder="Name, skill, tool…" value={q} onChange={setQ} />
            <FilterButton count={[cat !== 'all', record !== 'any'].filter(Boolean).length} onClick={() => setFilterSheet(true)} />
          </div>

          <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <aside aria-label="Filter creators" className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
              {creatorFilters}
            </aside>

            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  {creatorStatus === 'ready' || creatorStatus === 'empty' ? (
                    <><span className="nums tabular-nums">{shownCreators.length}</span> {shownCreators.length === 1 ? 'creator' : 'creators'}</>
                  ) : 'Creators'}
                </h2>
                <div className="flex items-center gap-2">
                  <label htmlFor="explore-sort" className="text-[13px] text-muted">Sort</label>
                  <select
                    id="explore-sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="h-11 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <ListState
                status={creatorStatus}
                error={profileError}
                onRetry={loadCreators}
                loading={<CreatorSkeletons />}
                empty={
                  <EmptyState
                    icon={Users}
                    title={creatorsFiltered ? 'No creators match that search' : 'No creator profiles yet'}
                    description={
                      creatorsFiltered
                        ? 'Try a broader category, or clear the contest-record filter — creators without a finalized result are still available to brief.'
                        : 'Creators appear here as they publish a profile. Judged results and scores live on Winners.'
                    }
                    action={
                      creatorsFiltered
                        ? <Button variant="secondary" className="h-11" onClick={() => { setQ(''); setCat('all'); setRecord('any'); }}>Clear filters</Button>
                        : <Button variant="secondary" className="h-11" to="/winners">See past winners</Button>
                    }
                  />
                }
              >
                <ul className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0">
                  {shownCreators.map((e) => (
                    <CreatorRow key={e.profile.id} profile={e.profile} perf={e.perf} onOpen={() => setOpen(e)} />
                  ))}
                </ul>
              </ListState>
            </div>
          </div>

          <Sheet
            open={filterSheet}
            onClose={() => setFilterSheet(false)}
            side="bottom"
            title="Filter creators"
            description="Counts update as you choose."
            footer={
              <Button className="h-11 w-full" onClick={() => setFilterSheet(false)}>
                Show {shownCreators.length} {shownCreators.length === 1 ? 'creator' : 'creators'}
              </Button>
            }
          >
            {creatorFilters}
          </Sheet>
        </div>
      ) : (
        <div id="explore-panel-work" role="tabpanel" aria-labelledby="explore-tab-work" tabIndex={-1} className="space-y-4 focus:outline-none">
          <div className="flex items-center gap-2">
            <SearchField id="explore-work-search" label="Search published work" placeholder="Title, creator, style…" value={workQ} onChange={setWorkQ} />
            <FilterButton count={workCat !== 'all' ? 1 : 0} onClick={() => setFilterSheet(true)} />
          </div>

          <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
            <aside aria-label="Filter work" className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
              {workFilters}
            </aside>

            <div className="min-w-0 space-y-4">
              <h2 className="font-display text-lg font-bold text-ink">
                {workStatus === 'ready' || workStatus === 'empty' ? (
                  <><span className="nums tabular-nums">{shownWork.length}</span> {shownWork.length === 1 ? 'piece' : 'pieces'} of work</>
                ) : 'Published work'}
              </h2>

              <ListState
                status={workStatus}
                error={postError}
                onRetry={loadWork}
                loading={<WorkSkeletons />}
                empty={
                  <EmptyState
                    icon={ImageIcon}
                    title={workQ.trim() || workCat !== 'all' ? 'No work matches that search' : 'No published work yet'}
                    description={
                      workQ.trim() || workCat !== 'all'
                        ? 'Try a different category or a broader search.'
                        : 'Work creators publish appears here. Winning entries from judged contests are shown on Winners.'
                    }
                    action={
                      workQ.trim() || workCat !== 'all'
                        ? <Button variant="secondary" className="h-11" onClick={() => { setWorkQ(''); setWorkCat('all'); }}>Clear filters</Button>
                        : <Button variant="secondary" className="h-11" to="/winners">See winning work</Button>
                    }
                  />
                }
              >
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {shownWork.map((p) => <WorkTile key={p.id} post={p} />)}
                </ul>
              </ListState>
            </div>
          </div>

          <Sheet
            open={filterSheet}
            onClose={() => setFilterSheet(false)}
            side="bottom"
            title="Filter work"
            footer={
              <Button className="h-11 w-full" onClick={() => setFilterSheet(false)}>
                Show {shownWork.length} {shownWork.length === 1 ? 'piece' : 'pieces'}
              </Button>
            }
          >
            {workFilters}
          </Sheet>
        </div>
      )}

      {/* One quiet next step, chosen by who is reading. */}
      <aside className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-relaxed text-muted">
          {role === 'client'
            ? 'Found someone? Contests are open to every eligible creator — you pick the winner after the work is judged.'
            : role === 'creator'
              ? 'Looking for briefs to enter rather than people to hire?'
              : 'Brands publish a brief, creators compete, and the winner is picked from judged work.'}
        </p>
        {role === 'client' ? (
          <Button to="/create-contest" className="h-11 shrink-0">Start a contest</Button>
        ) : role === 'creator' ? (
          <Button to="/discover" variant="secondary" className="h-11 shrink-0">
            <Search className="h-4 w-4" aria-hidden="true" />Browse open briefs
          </Button>
        ) : (
          <Button to={authStatus === 'authenticated' ? '/dashboard' : '/register'} className="h-11 shrink-0">
            {authStatus === 'authenticated' ? 'Go to dashboard' : 'Create an account'}
          </Button>
        )}
      </aside>

      <CreatorSheet entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}
