// RazeKit Tracker — the campaign command centre.
//
// Brands get a live ranking of every entry with the score composition made
// visible: Video Engagement and Brand Traffic are the two measured inputs, the
// Final Score is what they produce. Creators get their own performance record.
//
// READ ONLY for scores. Nothing here calculates a result — the server's scoring
// engine owns every number. What this file renders is the *composition* of a
// score the server already returned, using the campaign's own weights.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertCircle, Ban, Clock, Crown, ExternalLink, FileText, Lock, MousePointerClick,
  RotateCcw, ShieldCheck, Target, TrendingUp, Trophy, Wallet,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, dateShort, timeLeft } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, EmptyState, Label, PageHeader, Segmented, Skeleton, Spinner } from '@/components/ui';
import { ScoreBreakdown, ScorePill, ScoreStateBadge, SCORE_STATE_META } from '@/components/Score';

const nf = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN') : '—');
const one = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1) : null);
const msg = (e, fallback) => e?.data?.error?.message || e?.message || fallback;
const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const words = (s) => String(s || '—').replace(/_/g, ' ');
const stub = (id) => `Entry ${String(id).slice(0, 6).toUpperCase()}`;
const SELECT = 'h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

// The same wording the scoring engine records, so the reason a brand reads here
// is the reason the engine actually gave.
const EXCLUSION_COPY = {
  engagement: 'No engagement data recorded for this contest yet.',
  traffic: 'No verified traffic recorded for this contest yet.',
};
const SORTS = [
  { key: 'rank', label: 'Official rank' },
  { key: 'final', label: 'Final score' },
  { key: 'engagement', label: 'Video engagement' },
  { key: 'traffic', label: 'Brand traffic' },
  { key: 'newest', label: 'Most recent entry' },
];
const FILTERS = [
  { key: 'all', label: 'Everyone in the running' },
  { key: 'final', label: 'Final scores only' },
  { key: 'provisional', label: 'Provisional only' },
  { key: 'nodata', label: 'Awaiting data' },
];

/* ── small shared pieces ─────────────────────────────────────────────────── */

function Stat({ label, value, tone = 'text-ink', missing }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('font-display text-xl font-extrabold nums', tone)}>
        {value === null || value === undefined ? <span className="text-[13px] font-semibold text-muted">{missing || 'Not measured'}</span> : value}
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, accent }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        {Icon && <Icon className={cn('w-4 h-4', accent ? 'text-primary' : 'text-muted')} aria-hidden="true" />}
      </div>
      <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-ink nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </Card>
  );
}

function Freshness({ at }) {
  if (!at) return <span className="text-[11px] text-muted">No activity recorded yet</span>;
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
  const txt = m < 1 ? 'Updated just now' : m < 60 ? `Updated ${m}m ago` : m < 1440 ? `Updated ${Math.round(m / 60)}h ago` : `Updated ${dateShort(at)}`;
  return <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Clock className="w-3 h-3" aria-hidden="true" />{txt}</span>;
}

function TrafficPanel({ traffic, title = 'Brand traffic' }) {
  if (!traffic) return null;
  const t = traffic;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
        <Freshness at={t.updated_at} />
      </div>
      {!t.total_clicks ? (
        <EmptyState icon={MousePointerClick} title="No verified traffic yet"
          description="Traffic appears once the tracked campaign link starts receiving real visits." className="py-6" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Total clicks" value={nf(t.total_clicks)} />
            <Stat label="Verified" value={nf(t.verified_clicks)} tone="text-success" />
            <Stat label="Unique visitors" value={nf(t.unique_visitors)} tone="text-primary" />
            <Stat label="Excluded" value={nf(t.excluded_clicks)} tone="text-muted" />
          </div>
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-success mt-px" aria-hidden="true" />
            Only verified visits count toward Brand Traffic. Activity that cannot be verified is excluded from performance calculations.
          </p>
        </>
      )}
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );
}

/* ── score composition ───────────────────────────────────────────────────── */

/**
 * Explain a score the server already produced: which dimensions fed it, what
 * share each actually carried, and what each contributed. Mirrors the engine's
 * `explainScore`; it never replaces the server's final_score.
 */
function compose(entry, config) {
  const dims = [
    { key: 'engagement', label: 'Video engagement', score: entry?.engagement_score ?? null, weight: Number(config?.engagement_weight ?? 50), tone: 'primary' },
    { key: 'traffic', label: 'Brand traffic', score: entry?.traffic_score ?? null, weight: Number(config?.traffic_weight ?? 50), tone: 'accent' },
  ].filter((d) => d.weight > 0);
  const used = dims.filter((d) => typeof d.score === 'number' && Number.isFinite(d.score));
  const excluded = dims.filter((d) => !used.includes(d)).map((d) => ({ ...d, reason: EXCLUSION_COPY[d.key] }));
  const total = used.reduce((a, d) => a + d.weight, 0);
  const components = used.map((d) => ({
    ...d,
    effective_weight: total ? Math.round((d.weight / total) * 10000) / 100 : 0,
    contribution: total ? Math.round(((d.score * d.weight) / total) * 100) / 100 : 0,
  }));
  const derived = components.length ? Math.round(components.reduce((a, c) => a + c.contribution, 0) * 100) / 100 : null;
  const final = typeof entry?.final_score === 'number' ? entry.final_score : null;
  return {
    components, excluded, derived, final,
    reproportioned: excluded.length > 0 && components.length > 0,
    // A recorded score can predate the current rules. Say so rather than show a
    // breakdown that quietly disagrees with the number above it.
    stale: derived !== null && final !== null && Math.abs(derived - final) > 0.5,
  };
}

function DimensionMeter({ d, excludedReason }) {
  const shown = one(d.score);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{d.label}</span>
        <span className="font-display text-sm font-extrabold text-ink nums">
          {shown === null ? <span className="text-muted font-semibold">No data</span> : <>{shown}<span className="text-muted font-semibold"> / 100</span></>}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-line overflow-hidden" role="progressbar" aria-label={d.label}
        aria-valuenow={shown === null ? undefined : Number(shown)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full rk-bar', excludedReason ? 'bg-line-strong' : d.tone === 'accent' ? 'bg-accent' : 'bg-primary')}
          style={{ width: `${shown === null ? 0 : clamp(d.score)}%` }} />
      </div>
      {excludedReason ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-warning">
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
          <span><span className="font-semibold">Excluded from this score.</span> {excludedReason}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] leading-snug text-muted nums">
          Counts <span className="font-semibold text-ink">{d.effective_weight}%</span> of the final score
          {d.weight !== d.effective_weight && <span> (set at {d.weight}%)</span>}
          {' · '}adds <span className="font-semibold text-ink">{d.contribution.toFixed(2)}</span> points
        </p>
      )}
    </div>
  );
}

/** The centrepiece: the two measured inputs, then the score they produce. */
function ScoreComposition({ entry, config, disqualified }) {
  const c = compose(entry, config);
  const finalTxt = one(c.final);
  const state = disqualified ? 'disqualified' : (entry?.score_state || 'not_started');
  const showBar = finalTxt !== null && c.components.length > 0 && !c.stale;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {c.components.map((d) => <DimensionMeter key={d.key} d={d} />)}
        {c.excluded.map((d) => <DimensionMeter key={d.key} d={d} excludedReason={d.reason} />)}
      </div>

      {c.reproportioned && (
        <p className="rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2 text-[11px] leading-relaxed text-ink">
          <span className="font-semibold">Scored on {c.components.map((d) => d.label).join(' and ')} alone.</span>{' '}
          The remaining weight was re-proportioned, so this entry is not measured the same way as one with both dimensions.
        </p>
      )}

      <div className={cn('rounded-lg border p-4', disqualified ? 'border-danger/25 bg-danger/[0.05]' : 'border-line bg-surface-2')}>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Final score</p>
            <p className="mt-0.5 font-display text-[32px] leading-none font-extrabold tracking-tight text-ink nums">
              {finalTxt === null ? <span className="text-lg text-muted">Not scored yet</span> : <>{finalTxt}<span className="text-lg text-muted"> / 100</span></>}
            </p>
          </div>
          <ScoreStateBadge state={state} />
        </div>

        {showBar && (
          <>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-line" role="img"
              aria-label={`Final score ${finalTxt} of 100, made of ${c.components.map((d) => `${d.label} ${d.contribution.toFixed(2)}`).join(' and ')}`}>
              {c.components.map((d) => (
                <div key={d.key} className={cn('h-full rk-bar', d.tone === 'accent' ? 'bg-accent' : 'bg-primary')} style={{ width: `${clamp(d.contribution)}%` }} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              {c.components.map((d) => (
                <li key={d.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted nums">
                  <span className={cn('h-2 w-2 rounded-full', d.tone === 'accent' ? 'bg-accent' : 'bg-primary')} aria-hidden="true" />
                  {d.label} <span className="font-semibold text-ink">{d.contribution.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {c.stale && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            This score was recorded under earlier scoring rules, so it is shown as recorded rather than broken down against today's weights.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">{SCORE_STATE_META[state]?.hint || 'Scoring begins once the work is published and tracked.'}</p>
      </div>
    </div>
  );
}

/* ── ranking row ─────────────────────────────────────────────────────────── */

function RankRow({ entry, name, config, selected, onSelect, disqualified }) {
  const c = compose(entry, config);
  const finalTxt = one(c.final);
  const label = name || entry.title || stub(entry.submission_id);

  return (
    <button type="button" onClick={() => onSelect(selected ? null : entry.submission_id)} aria-expanded={selected}
      className={cn('w-full min-h-[44px] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        selected ? 'bg-primary/[0.06]' : 'hover:bg-surface-2')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[12px] font-extrabold nums',
          disqualified ? 'bg-danger/10 text-danger' : entry.rank === 1 ? 'bg-ink text-white' : 'bg-surface-2 text-muted')}>
          {disqualified ? <Ban className="w-3.5 h-3.5" aria-hidden="true" /> : (entry.rank ?? '–')}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink truncate">{label}</span>
            {entry.is_winner && <Badge tone="success"><Crown className="w-3 h-3" aria-hidden="true" /> Winner</Badge>}
          </span>
          {name && entry.title && <span className="block truncate text-[12px] text-muted">{entry.title}</span>}
          <span className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
            {finalTxt !== null && c.components.map((d) => (
              <span key={d.key} className={cn('h-full rk-bar', d.tone === 'accent' ? 'bg-accent' : 'bg-primary')} style={{ width: `${clamp(d.contribution)}%` }} />
            ))}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-display text-lg font-extrabold text-ink nums leading-none">
            {finalTxt === null ? <span className="text-[13px] font-semibold text-muted">No score</span> : finalTxt}
          </span>
          <span className="mt-1.5 block"><ScoreStateBadge state={disqualified ? 'disqualified' : entry.score_state} /></span>
        </span>
      </div>
    </button>
  );
}

/* ── moderation ──────────────────────────────────────────────────────────── */

function ModerationForm({ mode, submissionId, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isDq = mode === 'disqualify';
  const id = `${mode}-reason-${submissionId}`;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (reason.trim().length < 10) { setError('Give a reason of at least 10 characters. The creator is shown this text.'); return; }
    setBusy(true);
    try {
      await fn(isDq ? 'submissionDisqualify' : 'submissionReinstate', { submission_id: submissionId, reason: reason.trim() });
      onDone(true);
    } catch (err) {
      setError(msg(err, isDq ? 'Could not remove this entry.' : 'Could not reinstate this entry.'));
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-surface-2 p-3 space-y-2">
      <Label htmlFor={id}>{isDq ? 'Why is this entry being removed?' : 'Why is this entry being reinstated?'}</Label>
      <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
        aria-describedby={`${id}-help`} aria-invalid={error ? 'true' : undefined}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder={isDq ? 'e.g. The entry reuses footage from another campaign.' : 'e.g. The reported issue was investigated and not upheld.'} />
      <p id={`${id}-help`} className="text-[11px] text-muted nums">
        {isDq ? 'The creator is shown this reason and is notified. ' : 'Recorded on the original decision. '}
        {reason.trim().length}/10 characters minimum.
      </p>
      {error && <p role="alert" className="text-[12px] font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant={isDq ? 'danger' : 'primary'} loading={busy} disabled={busy}>
          {isDq ? 'Remove from ranking' : 'Reinstate entry'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </form>
  );
}

/* ── entry detail (desktop panel + mobile expansion) ─────────────────────── */

function EntryDetail({ entry, name, config, campaign, dq, onChanged }) {
  const [mode, setMode] = useState(null);
  useEffect(() => { setMode(null); }, [entry?.submission_id]);
  if (!entry) return null;

  const disqualified = Boolean(dq);
  const finalized = Boolean(campaign?.winner_submission_id);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">{name || entry.title || stub(entry.submission_id)}</h3>
            <p className="text-[12px] text-muted">
              {entry.title ? <span className="text-ink">{entry.title}</span> : 'No entry title provided'}
              {entry.submitted_at && <> · submitted {dateShort(entry.submitted_at)}</>}
            </p>
          </div>
          {entry.is_winner && <Badge tone="success"><Crown className="w-3 h-3" aria-hidden="true" /> Winner</Badge>}
        </div>
        {!name && <p className="text-[11px] text-muted">Creator name is not available in this view — open the campaign review to see the full entry.</p>}
      </header>

      {disqualified && (
        <div className="rounded-lg border border-danger/25 bg-danger/[0.05] p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-danger"><Ban className="w-3.5 h-3.5" aria-hidden="true" /> Excluded from ranking</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink">{dq.reason}</p>
          <p className="mt-1 text-[11px] text-muted">
            {dq.reason_code ? `${words(dq.reason_code)} · ` : ''}{dq.applied_at ? `Applied ${dateShort(dq.applied_at)}` : 'Applied'}
            {' · '}Measured scores are preserved, but this entry cannot win.
          </p>
        </div>
      )}

      <ScoreComposition entry={entry} config={config} disqualified={disqualified} />

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-line p-3">
        <Stat label="Verified visitors sent" value={entry.verified_visitors === null || entry.verified_visitors === undefined ? null : nf(entry.verified_visitors)} tone="text-primary" />
        <Stat label="Official rank" value={entry.rank ?? null} missing="Not ranked yet" />
      </div>

      <div className="flex flex-wrap gap-2">
        {entry.creator_id && <Button to={`/u/${entry.creator_id}`} variant="secondary" size="sm">View creator <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></Button>}
        {campaign?.contest_id && <Button to={`/contest/${campaign.contest_id}/review`} variant="secondary" size="sm">Open in review</Button>}
      </div>

      <div className="border-t border-line pt-3">
        {mode ? (
          <ModerationForm mode={mode} submissionId={entry.submission_id} onDone={(changed) => { setMode(null); if (changed) onChanged(); }} />
        ) : finalized ? (
          <>
            <Button size="sm" variant="secondary" disabled>Entries are locked</Button>
            <p className="mt-1.5 text-[11px] text-muted">This campaign has a finalized winner, so entries can no longer be removed or reinstated.</p>
          </>
        ) : disqualified ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode('reinstate')}><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reinstate entry</Button>
            <p className="mt-1.5 text-[11px] text-muted">Puts this entry back in the running. The original decision stays on record.</p>
          </>
        ) : (
          <>
            <Button size="sm" variant="outlineDanger" onClick={() => setMode('disqualify')}><Ban className="w-3.5 h-3.5" aria-hidden="true" /> Remove from ranking</Button>
            <p className="mt-1.5 text-[11px] text-muted">
              Removing an entry excludes it from ranking with a reason the creator can see. It never deletes their work or their measured scores.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** One ranking group: header, rows, and the mobile-only inline detail. */
function EntryList({ heading, note, tone, entries, disqualified, ctx, empty }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className={cn('border-b border-line px-4 py-2.5', tone === 'danger' ? 'bg-danger/[0.05]' : 'bg-surface-2')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider', tone === 'danger' ? 'text-danger' : 'text-muted')}>
            {tone === 'danger' && <Ban className="w-3.5 h-3.5" aria-hidden="true" />}{heading}
          </h2>
          {note && <p className="text-[11px] text-muted nums shrink-0" aria-live="polite">{note}</p>}
        </div>
        {tone === 'danger' && <p className="mt-0.5 text-[11px] text-muted">These entries cannot win. Their work and measured scores are kept on record.</p>}
      </div>
      {entries.length === 0 ? <div className="p-4">{empty}</div> : (
        <ul className="divide-y divide-line">
          {entries.map((e) => {
            const open = ctx.entryId === e.submission_id;
            const props = { entry: e, name: ctx.nameBySub.get(e.submission_id), config: ctx.config, disqualified };
            return (
              <li key={e.submission_id}>
                <RankRow {...props} selected={open} onSelect={ctx.setEntryId} />
                {open && (
                  <div className="lg:hidden border-t border-line bg-surface-2/60">
                    <EntryDetail entry={e} name={props.name} config={ctx.config} campaign={ctx.campaign}
                      dq={ctx.dqBySub.get(e.submission_id)} onChanged={ctx.reload} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ScoringRules({ scoring }) {
  if (!scoring?.config) return null;
  const { engagement_weight: we, traffic_weight: wt, winner_method: method, tie_break: tie, version } = scoring.config;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Scoring rules for this campaign</h2>
          <p className="mt-1.5 font-display text-[15px] font-bold text-ink nums">
            Final score = <span className="text-primary">{we}% Video Engagement</span> + <span className="text-accent">{wt}% Brand Traffic</span>
          </p>
        </div>
        {scoring.locked && <Badge tone="neutral"><Lock className="w-3 h-3" aria-hidden="true" /> Locked</Badge>}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Winner method: <span className="text-ink font-medium">{words(method)}</span>
        {tie && <> · Tie-break: <span className="text-ink font-medium">{words(tie)}</span></>}
        {version && <> · Rules version <span className="nums">{version}</span></>}
      </p>
      {scoring.lock_reason && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{scoring.lock_reason}</p>}
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
        RazeKit calculates every score. You can inspect exactly how a score was composed, but you cannot change it.
      </p>
    </Card>
  );
}

/* ── brand command centre ────────────────────────────────────────────────── */

function BrandTracker() {
  const [overview, setOverview] = useState(null);
  const [camps, setCamps] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [report, setReport] = useState(null);
  const [dqs, setDqs] = useState(null);
  const [detailErr, setDetailErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [entryId, setEntryId] = useState(null);
  const [sort, setSort] = useState('rank');
  const [filter, setFilter] = useState('all');

  const loadPortfolio = useCallback(() => {
    setErr('');
    Promise.all([fn('trackerBrandOverview', {}), fn('trackerBrandCampaigns', {})])
      .then(([o, c]) => {
        setOverview(o);
        const list = c?.campaigns || [];
        setCamps(list);
        setSel((s) => s || list[0]?.contest_id || null);
      })
      .catch((e) => { setErr(msg(e, 'Could not load your campaigns.')); setCamps([]); });
  }, []);

  const loadCampaign = useCallback((id) => {
    if (!id) return;
    setLoading(true); setDetailErr(''); setEntryId(null);
    Promise.all([
      fn('trackerCampaignDetail', { contest_id: id }),
      fn('scoringConfigGet', { contest_id: id }).catch(() => null),
      fn('campaignReport', { contest_id: id }).catch(() => null),
      fn('disqualificationList', { contest_id: id }).catch(() => null),
    ])
      .then(([d, s, r, q]) => { setDetail(d); setScoring(s); setReport(r); setDqs(q); })
      .catch((e) => { setDetail(null); setDetailErr(msg(e, 'Could not load this campaign.')); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);
  useEffect(() => { loadCampaign(sel); }, [sel, loadCampaign]);

  // Real names wherever the API gives one; never an invented placeholder.
  const nameBySub = useMemo(() => {
    const m = new Map();
    (report?.top_performers || []).forEach((p) => { if (p.creator_name) m.set(p.submission_id, p.creator_name); });
    (dqs?.disqualifications || []).forEach((d) => { if (d.creator_name) m.set(d.submission_id, d.creator_name); });
    return m;
  }, [report, dqs]);

  const dqBySub = useMemo(() => {
    const m = new Map();
    (dqs?.disqualifications || []).filter((d) => d.status === 'ACTIVE').forEach((d) => m.set(d.submission_id, d));
    return m;
  }, [dqs]);

  // A draft that was never submitted is not an entry and is not counted as one.
  const entered = useMemo(() => (detail?.entries || []).filter((e) => e.status !== 'working'), [detail]);
  const isDq = useCallback((e) => dqBySub.has(e.submission_id) || e.score_state === 'disqualified', [dqBySub]);
  const excluded = useMemo(() => entered.filter(isDq), [entered, isDq]);

  const ranked = useMemo(() => {
    const kept = entered.filter((e) => !isDq(e)).filter((e) => {
      if (filter === 'final') return e.score_state === 'final';
      if (filter === 'provisional') return e.score_state === 'provisional' || e.score_state === 'calculating';
      if (filter === 'nodata') return e.final_score === null || ['insufficient_data', 'not_started'].includes(e.score_state);
      return true;
    });
    const by = (k) => (a, b) => (b[k] ?? -1) - (a[k] ?? -1);
    if (sort === 'final') return [...kept].sort(by('final_score'));
    if (sort === 'engagement') return [...kept].sort(by('engagement_score'));
    if (sort === 'traffic') return [...kept].sort(by('traffic_score'));
    if (sort === 'newest') return [...kept].sort((a, b) => (Date.parse(b.submitted_at || 0) || 0) - (Date.parse(a.submitted_at || 0) || 0));
    return [...kept].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }, [entered, isDq, filter, sort]);

  const selectedEntry = useMemo(() => entered.find((e) => e.submission_id === entryId) || null, [entered, entryId]);

  if (err) {
    return (
      <Card className="p-5">
        <p role="alert" className="text-sm text-danger">{err}</p>
        <p className="mt-1 text-[12px] text-muted">Your campaigns could not be loaded. Check your connection and try again.</p>
        <Button className="mt-3" size="sm" variant="secondary" onClick={loadPortfolio}>Try again</Button>
      </Card>
    );
  }
  if (!overview || camps === null) return <ListSkeleton />;

  const k = overview.kpis;
  const campaign = detail?.campaign;
  const ctx = { nameBySub, dqBySub, config: scoring?.config, campaign, entryId, setEntryId, reload: () => loadCampaign(sel) };

  return (
    <div className="space-y-5">
      {overview.attention?.length > 0 && (
        <Card className="p-4 border-warning/30 bg-warning/[0.05]">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
            <AlertCircle className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Needs attention
          </h2>
          <ul className="mt-2 space-y-1">{overview.attention.map((a) => <li key={a.kind} className="text-sm text-muted">{a.message}</li>)}</ul>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Campaigns" value={nf(k.total_campaigns)} sub={`${nf(k.active_campaigns)} running`} icon={Target} accent />
        <Kpi label="Entries" value={nf(k.submissions)} sub={`${nf(k.participants)} creators`} icon={FileText} />
        <Kpi label="Verified visitors" value={nf(overview.traffic?.unique_visitors)} sub="Sent to your brand" icon={MousePointerClick} />
        <Kpi label="Prize committed" value={k.total_prize_value ? money(k.total_prize_value, k.currency) : 'None yet'} sub={`${nf(k.winners)} winners selected`} icon={Trophy} />
      </div>

      {camps.length === 0 ? (
        <EmptyState icon={Target} title="No campaigns yet"
          description="Launch a contest to start measuring creator performance. Entries, verified traffic and scores appear here as they arrive."
          action={<Button to="/create-contest" size="sm">Launch a contest</Button>} />
      ) : (
        <>
          {/* Campaign switcher — scrolls in its own container, never the page. */}
          <div>
            <p id="camp-rail" className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Campaign</p>
            <div className="-mx-1 overflow-x-auto no-scrollbar" role="group" aria-labelledby="camp-rail">
              <div className="flex gap-2 px-1 pb-1">
                {camps.map((c) => {
                  const active = c.contest_id === sel;
                  return (
                    <button key={c.contest_id} type="button" onClick={() => setSel(c.contest_id)} aria-pressed={active}
                      className={cn('min-h-[44px] shrink-0 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        active ? 'border-primary bg-primary/[0.07]' : 'border-line bg-surface hover:border-line-strong')}>
                      <span className={cn('block max-w-[190px] truncate text-[13px] font-semibold', active ? 'text-primary' : 'text-ink')}>{c.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted nums">{words(c.status)} · {nf(c.submissions)} entries</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {loading && <ListSkeleton />}

          {!loading && detailErr && (
            <Card className="p-5">
              <p role="alert" className="text-sm text-danger">{detailErr}</p>
              <Button className="mt-3" size="sm" variant="secondary" onClick={() => loadCampaign(sel)}>Try again</Button>
            </Card>
          )}

          {!loading && campaign && (
            <>
              <Card className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/contest/${campaign.contest_id}`} className="font-display text-xl font-extrabold tracking-tight text-ink hover:text-primary">{campaign.title}</Link>
                    <p className="mt-0.5 text-[12px] text-muted nums">
                      {money(campaign.prize_amount, campaign.currency)} prize · {campaign.category || 'Uncategorised'}
                      {campaign.deadline && <> · {timeLeft(campaign.deadline) === 'Ended' ? `closed ${dateShort(campaign.deadline)}` : `${timeLeft(campaign.deadline)} left`}</>}
                    </p>
                  </div>
                  <Badge tone={campaign.status === 'open' ? 'primary' : campaign.winner_submission_id ? 'success' : 'neutral'}>{words(campaign.status)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Entries" value={nf(entered.length)} />
                  <Stat label="Scored" value={nf(report?.participation?.scored_submissions ?? entered.filter((e) => e.final_score !== null).length)} />
                  <Stat label="Excluded" value={nf(excluded.length)} tone="text-danger" />
                  <Stat label="Best final score" value={one(report?.performance?.best_final)} tone="text-primary" missing="Not scored yet" />
                </div>
                {!campaign.has_destination && (
                  <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-warning mt-px" aria-hidden="true" />
                    No campaign destination set, so Brand Traffic cannot be measured here. Entries will be scored on Video Engagement alone.
                  </p>
                )}
              </Card>

              <ScoringRules scoring={scoring} />

              {entered.length === 0 ? (
                <EmptyState icon={Activity} title="No entries yet"
                  description="Creators have not submitted to this campaign yet. As entries arrive they are ranked here, with their Video Engagement and Brand Traffic shown side by side."
                  action={<Button to={`/contest/${campaign.contest_id}`} size="sm" variant="secondary">View the campaign page</Button>} />
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="rk-sort">Sort ranking by</Label>
                      <select id="rk-sort" className={SELECT} value={sort} onChange={(e) => setSort(e.target.value)}>
                        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="rk-filter">Show</Label>
                      <select id="rk-filter" className={SELECT} value={filter} onChange={(e) => setFilter(e.target.value)}>
                        {FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
                    <div className="min-w-0 space-y-4">
                      <EntryList heading="Ranking" note={`${ranked.length} of ${entered.length - excluded.length} shown`}
                        entries={ranked} ctx={ctx}
                        empty={<EmptyState icon={TrendingUp} title="No entries match this filter"
                          description="Change the filter above to see the rest of this campaign's entries." className="py-6" />} />

                      {excluded.length > 0 && (
                        <EntryList heading={`Excluded from ranking (${excluded.length})`} tone="danger" entries={excluded} disqualified ctx={ctx} />
                      )}

                      <TrafficPanel traffic={detail.traffic} title="Brand traffic from this campaign" />
                    </div>

                    <div className="hidden lg:block lg:sticky lg:top-6">
                      <Card className="overflow-hidden">
                        {selectedEntry ? (
                          <EntryDetail entry={selectedEntry} name={nameBySub.get(selectedEntry.submission_id)} config={scoring?.config}
                            campaign={campaign} dq={dqBySub.get(selectedEntry.submission_id)} onChanged={ctx.reload} />
                        ) : (
                          <div className="p-5">
                            <EmptyState icon={TrendingUp} title="Select an entry"
                              description="Choose a creator from the ranking to see what they submitted, how their Video Engagement and Brand Traffic combined, and whether the score is final."
                              className="py-8 border-0 bg-transparent" />
                          </div>
                        )}
                      </Card>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── creator record ──────────────────────────────────────────────────────── */

function CreatorTracker() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fn('trackerCreatorOverview', {}).then(setData).catch((e) => setErr(msg(e, 'Could not load your performance.')));
    fn('trackerCreatorContests', {}).then((d) => setRows(d?.contests || [])).catch(() => setRows([]));
  }, []);

  if (err) return <Card className="p-5"><p role="alert" className="text-sm text-danger">{err}</p></Card>;
  if (!data) return <ListSkeleton />;

  const k = data.kpis;
  const best = (rows || []).filter((r) => typeof r.final_score === 'number').sort((a, b) => b.final_score - a.final_score)[0];

  return (
    <div className="space-y-5">
      <Segmented value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'contests', label: 'My contests' },
        { key: 'traffic', label: 'Traffic' },
      ]} />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Contests joined" value={nf(k.contests_joined)} sub={`${nf(k.active_contests)} active`} icon={Target} />
            <Kpi label="Wins" value={nf(k.wins)} sub={k.win_rate === null ? 'No completed contests yet' : `${k.win_rate}% win rate`} icon={Trophy} accent />
            {/* Two separate facts. What you WON is not what has reached your
                bank — merging them would contradict the balance page. */}
            <Kpi label="Prize value won" value={k.prize_value_won ? money(k.prize_value_won, k.currency) : 'None yet'} sub={`${nf(k.wins)} ${k.wins === 1 ? 'win' : 'wins'}`} icon={Trophy} />
            <Kpi label="Paid out" value={k.paid_out ? money(k.paid_out, k.currency) : 'Nothing yet'}
              sub={k.awaiting_payout > 0 ? `${money(k.awaiting_payout, k.currency)} owed to you` : 'Transferred to your bank'} icon={Wallet} />
            <Kpi label="Avg final score" value={one(k.average_final_score) ?? 'Not scored yet'}
              sub={k.average_final_score === null ? 'No finalized scores yet' : 'Across finalized contests'} icon={TrendingUp} />
          </div>

          {best ? (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Your best performance</h2>
                <Link to={`/contest/${best.contest_id}`} className="text-[12px] font-medium text-primary hover:underline">{best.contest_title}</Link>
              </div>
              <ScoreBreakdown engagement={best.engagement_score} traffic={best.traffic_score} final={best.final_score} state={best.score_state} />
            </Card>
          ) : (
            <Card className="p-5">
              <EmptyState icon={Activity} title="No finalized performance data yet"
                description="Join a contest and submit your work. Once results are finalized, your scores appear here." className="py-8" />
            </Card>
          )}

          <TrafficPanel traffic={data.traffic} title="Traffic you sent" />
        </div>
      )}

      {tab === 'contests' && (
        rows === null ? <div className="py-12 grid place-items-center"><Spinner /></div>
          : rows.length === 0 ? (
            <EmptyState icon={Target} title="You haven't joined a contest yet"
              description="Browse open contests and submit your first entry. Your scores start once your work is published and tracked."
              action={<Button to="/discover" size="sm">Discover contests</Button>} />
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <Card key={r.submission_id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/contest/${r.contest_id}`} className="font-display font-bold text-ink hover:text-primary">{r.contest_title}</Link>
                      <p className="text-[11px] text-muted nums">{money(r.prize_amount, r.currency)} · {r.category || 'Uncategorised'}</p>
                    </div>
                    {r.is_winner ? <Badge tone="success"><Crown className="w-3 h-3" aria-hidden="true" /> Won</Badge> : <ScoreStateBadge state={r.score_state} />}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div><p className="text-[10px] uppercase tracking-wider text-muted">Engagement</p><ScorePill value={r.engagement_score} /></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-muted">Traffic</p><ScorePill value={r.traffic_score} /></div>
                    <div><p className="text-[10px] uppercase tracking-wider text-muted">Final</p><ScorePill value={r.final_score} /></div>
                  </div>
                </Card>
              ))}
            </div>
          )
      )}

      {tab === 'traffic' && <TrafficPanel traffic={data.traffic} title="Traffic you sent" />}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function Tracker() {
  const { user, role } = useAuth();
  const isBrand = role === 'client';
  const name = user?.full_name || user?.email?.split('@')[0] || '';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tracker"
        title={isBrand ? (name ? `${name} — campaign command centre` : 'Campaign command centre') : (name ? `${name}'s performance` : 'Your performance')}
        description={isBrand
          ? 'Who is performing best, and why. Video Engagement and Brand Traffic are the two measured inputs behind every Final Score.'
          : 'Your contests, scores, verified traffic and winnings — measured, not estimated.'}
      />
      {isBrand ? <BrandTracker /> : <CreatorTracker />}
    </div>
  );
}
