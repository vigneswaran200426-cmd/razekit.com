// Shared RazeKit performance-score display (spec 26/27).
// This is presentation ONLY — every number comes from the server's scoring
// engine. Nothing here recomputes a score.
import { ShieldCheck, Clock, MinusCircle, Ban } from 'lucide-react';
import { Badge } from '@/components/ui';

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1) : null);

// Honest states — we never render a fabricated 0 when data is simply absent.
export const SCORE_STATE_META = {
  not_started: { label: 'Not started', tone: 'neutral', icon: Clock, hint: 'Scoring begins once your work is published and tracked.' },
  insufficient_data: { label: 'No data yet', tone: 'neutral', icon: MinusCircle, hint: 'Not enough verified activity to calculate a score.' },
  calculating: { label: 'Calculating', tone: 'primary', icon: Clock, hint: 'Performance data is being processed.' },
  provisional: { label: 'Provisional', tone: 'warning', icon: Clock, hint: 'Some signals are still arriving, so this score can still change.' },
  final: { label: 'Final', tone: 'success', icon: ShieldCheck, hint: 'This score is finalized and preserved for this contest.' },
  disqualified: { label: 'Disqualified', tone: 'danger', icon: Ban, hint: 'This entry is excluded from scoring.' },
};

export function ScoreStateBadge({ state }) {
  const meta = SCORE_STATE_META[state] || SCORE_STATE_META.not_started;
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone}>
      <span className="inline-flex items-center gap-1">
        <Icon className="w-3 h-3" aria-hidden="true" />
        {meta.label}
      </span>
    </Badge>
  );
}

/** A single 0–100 dimension with a proportional bar. */
export function ScoreBar({ label, value, hint, tone = 'primary' }) {
  const shown = fmt(value);
  const pct = shown === null ? 0 : Math.max(0, Math.min(100, value));
  const barTone = tone === 'accent' ? 'bg-accent' : 'bg-primary';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
        <span className="font-display text-sm font-extrabold text-ink nums">
          {shown === null ? <span className="text-muted font-semibold">No data yet</span> : <>{shown}<span className="text-muted font-semibold"> / 100</span></>}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full rounded-full bg-line overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={shown === null ? undefined : Number(shown)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${barTone} rk-bar`} style={{ width: `${pct}%` }} />
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Full breakdown: both dimensions plus the Final Score and the explanation the
 * spec requires — including that popularity signals never win on their own.
 */
export function ScoreBreakdown({ engagement, traffic, final, state = 'final', compact = false }) {
  const f = fmt(final);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Final score</p>
          <p className="mt-0.5 font-display text-3xl font-extrabold tracking-tight text-ink nums">
            {f === null ? <span className="text-xl text-muted">Not scored yet</span> : <>{f}<span className="text-lg text-muted"> / 100</span></>}
          </p>
        </div>
        <ScoreStateBadge state={state} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ScoreBar label="Video engagement" value={engagement} />
        <ScoreBar label="Brand traffic" value={traffic} tone="accent" />
      </div>

      {!compact && (
        <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-1.5">
          <p className="text-[12px] font-semibold text-ink">Final Score = 50% Video Engagement + 50% Brand Traffic.</p>
          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-ink">Video Engagement</span> measures the overall performance of your creative work
            across supported engagement signals. <span className="font-medium text-ink">Brand Traffic</span> measures verified
            visitors sent to the brand.
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            Followers, views, likes and comments do not independently determine the winner — they contribute to the overall
            Video Engagement score. Activity that cannot be verified may be excluded from performance calculations.
          </p>
        </div>
      )}
    </div>
  );
}

/** Compact inline score for table rows. */
export function ScorePill({ value }) {
  const v = fmt(value);
  if (v === null) return <span className="text-muted text-sm">—</span>;
  return <span className="font-display font-extrabold text-ink nums">{v}</span>;
}
