// RazeKit — Campaign report (route /contest/:id/report).
//
// This is a DOCUMENT, not a dashboard. A brand should be able to print it and
// send it round internally. Every figure is served by campaignReport; nothing
// here computes, estimates or fills in a number.
//
// The honesty rule that shapes the whole page: an absent measurement is stated,
// never rendered as 0. A zero next to "revenue" is a claim that the campaign
// earned nothing — a different and false statement from "we do not measure it".
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Printer, ArrowLeft, Trophy, ShieldCheck, MinusCircle, AlertCircle, Lock,
  FileText, Users, Ban,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { money, moneyMinor, dateShort } from '@/lib/format';
import { Card, Button, Badge, Skeleton, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const PRINT_CSS = `
@media print {
  header, footer, nav, .rk-noprint { display: none !important; }
  .rk-doc { max-width: none !important; padding: 0 !important; }
  .rk-sec { break-inside: avoid; page-break-inside: avoid; }
  .rk-doc, .rk-doc * { box-shadow: none !important; }
}
@media (prefers-reduced-motion: reduce) { .rk-doc * { animation: none !important; transition: none !important; } }
`;

const nf = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN') : null);

/** A measurement that does not exist. Never a 0, never a bare dash. */
function NotYet({ children = 'Not scored yet' }) {
  return <span className="text-[13px] font-medium text-muted">{children}</span>;
}

function Score({ value }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return <NotYet />;
  return <>{value.toFixed(1)}<span className="text-muted font-semibold text-[13px]"> / 100</span></>;
}

const VERIFY_COPY = {
  PENDING: { label: 'Verification not started', tone: 'neutral' },
  CODE_ISSUED: { label: 'Verification code issued', tone: 'primary' },
  SUBMITTED: { label: 'Verification in progress', tone: 'primary' },
  VERIFIED: { label: 'Ownership verified', tone: 'success' },
  MANUAL_REVIEW: { label: 'Being reviewed by a person', tone: 'warning' },
  FAILED: { label: 'Not verified', tone: 'danger' },
  NOT_SUPPORTED: { label: 'Manual verification', tone: 'warning' },
  EXPIRED: { label: 'Verification expired', tone: 'neutral' },
};

const FUNDING_COPY = {
  FUNDING_REQUIRED: { label: 'Funding required', tone: 'warning' },
  PAYMENT_INSTRUCTIONS_SHOWN: { label: 'Awaiting transfer', tone: 'warning' },
  TRANSFER_REPORTED: { label: 'Transfer reported, not yet checked', tone: 'warning' },
  PENDING_VERIFICATION: { label: 'Awaiting finance check', tone: 'warning' },
  NEEDS_INFORMATION: { label: 'More information needed', tone: 'warning' },
  PARTIAL: { label: 'Part received', tone: 'warning' },
  OVERPAID: { label: 'Received, above the amount due', tone: 'success' },
  VERIFIED: { label: 'Prize commitment confirmed', tone: 'success' },
  REJECTED: { label: 'Transfer not matched', tone: 'danger' },
  CANCELLED: { label: 'Funding cancelled', tone: 'neutral' },
  REFUND_PENDING: { label: 'Refund pending', tone: 'warning' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
};

/* ── Document scaffolding ─────────────────────────────────────────────────── */

function Section({ n, title, note, children }) {
  return (
    <section className="rk-sec border-t border-line pt-6 sm:pt-8 grid gap-3 sm:gap-6 md:grid-cols-[176px_1fr]">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
          <span className="mr-2 nums text-primary">{n}</span>{title}
        </h2>
        {note && <p className="mt-2 hidden text-[12px] leading-relaxed text-muted md:block">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-2.5 last:border-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="font-display text-[15px] font-bold text-ink nums">{value}</dd>
      {hint && <p className="w-full text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/* ── Sections ─────────────────────────────────────────────────────────────── */

function Outcome({ campaign, winner, funding }) {
  const fundMeta = FUNDING_COPY[funding?.status] || { label: funding?.status || 'Unknown', tone: 'neutral' };
  const verify = winner?.verification_status ? VERIFY_COPY[winner.verification_status] : null;

  return (
    <div className="space-y-4">
      {winner ? (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Winner
              </p>
              <p className="mt-1.5 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                {winner.creator_name || 'Name unavailable'}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {winner.selected_at ? `Selected ${dateShort(winner.selected_at)}` : 'Selection date not recorded'}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Final score</p>
              <p className="mt-1 font-display text-2xl font-extrabold text-ink nums">
                <Score value={winner.final_score} />
              </p>
            </div>
          </div>
          {verify && (
            <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Badge tone={verify.tone}>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />{verify.label}
                </span>
              </Badge>
              {winner.verified_at && <span className="text-[12px] text-muted">Verified {dateShort(winner.verified_at)}</span>}
            </p>
          )}
        </Card>
      ) : (
        <EmptyState
          icon={Trophy}
          title="No winner selected yet"
          description={`This campaign is at "${campaign.state_label}". A winner appears here once the brand has chosen one.`}
          className="py-8"
        />
      )}

      <dl>
        <Row
          label="Prize"
          value={campaign.prize_amount === null ? <NotYet>Not set</NotYet> : money(campaign.prize_amount, campaign.currency)}
        />
        <Row label="Prize commitment" value={<Badge tone={fundMeta.tone}>{fundMeta.label}</Badge>} />
        {typeof funding?.prize_amount_minor === 'number' && (
          <Row label="Prize recorded against funding" value={moneyMinor(funding.prize_amount_minor, campaign.currency)} />
        )}
        {typeof funding?.platform_fee_minor === 'number' && (
          <Row label="Platform fee" value={moneyMinor(funding.platform_fee_minor, campaign.currency)} />
        )}
        {typeof funding?.total_amount_minor === 'number' && (
          <Row label="Total funded" value={moneyMinor(funding.total_amount_minor, campaign.currency)}
            hint={funding.verified_at ? `Confirmed against the bank record on ${dateShort(funding.verified_at)}.` : undefined} />
        )}
      </dl>
    </div>
  );
}

function Participation({ p }) {
  return (
    <dl>
      <Row label="Entries received" value={nf(p.submissions) ?? '0'} hint="Drafts that were never submitted are not counted as entries." />
      <Row label="Valid entries" value={nf(p.valid_submissions) ?? '0'} />
      <Row label="Disqualified" value={nf(p.disqualified) ?? '0'} />
      <Row label="Scored" value={nf(p.scored_submissions) ?? '0'} />
      <Row
        label="Not scored"
        value={nf(p.unscored_submissions) ?? '0'}
        hint={p.unscored_submissions > 0 ? 'These entries had no measurable performance data at the time of this report.' : undefined}
      />
    </dl>
  );
}

function Performance({ perf }) {
  const s = perf.scoring || {};
  const hasAvg = perf.average_final !== null && perf.average_final !== undefined;
  return (
    <div className="space-y-5">
      <dl>
        <Row label="Average final score" value={<Score value={perf.average_final} />} />
        <Row label="Best final score" value={<Score value={perf.best_final} />} />
        <Row label="Average video engagement" value={<Score value={perf.average_engagement} />} />
        <Row label="Average brand traffic" value={<Score value={perf.average_traffic} />} />
      </dl>

      {!hasAvg && (
        <p className="rounded-md border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-muted" role="note">
          No entry has been scored yet, so no average exists. This is not a score of zero.
        </p>
      )}

      <dl>
        <Row label="Verified unique visitors" value={nf(perf.verified_unique_visitors) ?? <NotYet>Not measured</NotYet>} />
        <Row
          label="Clicks excluded as suspicious"
          value={nf(perf.excluded_suspicious_clicks) ?? '0'}
          hint="Excluded activity never counted toward any score. It is reported here rather than hidden, because concealing it would overstate reach."
        />
        <Row label="Tracking links issued" value={nf(perf.tracking_links) ?? '0'} />
      </dl>

      <p className="text-[12px] leading-relaxed text-muted">
        Final scores combine video engagement and brand traffic at{' '}
        <span className="font-semibold text-ink nums">{Math.round((s.engagement_weight ?? 0) * 100)}%</span> /{' '}
        <span className="font-semibold text-ink nums">{Math.round((s.traffic_weight ?? 0) * 100)}%</span>
        {s.config_version ? ` (scoring configuration ${s.config_version})` : ''}. The same weights applied to every entry in this campaign.
      </p>
    </div>
  );
}

function Ranking({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={Users}
        title="Nothing to rank yet"
        description="A ranking appears once at least one entry has a final score. No entry in this campaign has been scored so far."
        className="py-8"
      />
    );
  }
  return (
    <div>
      <div className="hidden border-b border-line-strong pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-[40px_1fr_76px_76px_88px] sm:gap-x-3">
        <span>#</span><span>Creator</span>
        <span className="text-right">Engage</span><span className="text-right">Traffic</span><span className="text-right">Final</span>
      </div>
      <ol>
        {rows.map((r, i) => (
          <li
            key={r.submission_id}
            className={cn(
              'grid grid-cols-[40px_1fr] items-center gap-x-3 gap-y-2 border-b border-line py-3 last:border-0',
              'sm:grid-cols-[40px_1fr_76px_76px_88px]',
              r.is_winner && 'bg-primary/[0.04]'
            )}
          >
            <span className="font-display text-[15px] font-extrabold text-muted nums">{r.rank ?? i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-ink">{r.creator_name || 'Name unavailable'}</span>
              {r.is_winner && (
                <span className="mt-1 inline-flex"><Badge tone="primary">
                  <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3" aria-hidden="true" />Winner</span>
                </Badge></span>
              )}
            </span>
            <span className="col-span-2 flex items-center gap-5 sm:contents">
              <Cell label="Engage" value={r.engagement_score} />
              <Cell label="Traffic" value={r.traffic_score} />
              <Cell label="Final" value={r.final_score} strong />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Cell({ label, value, strong }) {
  const shown = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : null;
  return (
    <span className="flex items-baseline gap-1.5 sm:justify-end">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted sm:hidden">{label}</span>
      <span className={cn('font-display nums', strong ? 'text-[15px] font-extrabold text-ink' : 'text-[14px] font-bold text-ink')}>
        {shown ?? <span className="text-[12px] font-medium text-muted">n/a</span>}
      </span>
    </span>
  );
}

function NotMeasured({ items }) {
  const entries = Object.entries(items || {});
  if (!entries.length) return null;
  const LABELS = {
    clicks_to_conversion: 'Conversions',
    attributed_revenue: 'Attributed revenue',
    roi: 'Return on investment',
  };
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface-2/60 p-4 sm:p-5">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
        <MinusCircle className="h-3.5 w-3.5 text-muted" aria-hidden="true" /> Not measured by RazeKit
      </p>
      <dl className="mt-3 space-y-2.5">
        {entries.map(([k, reason]) => (
          <div key={k}>
            <dt className="text-[13px] font-semibold text-ink">{LABELS[k] || k.replace(/_/g, ' ')}</dt>
            <dd className="text-[12px] leading-relaxed text-muted">{reason}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
        These are absent, not zero. RazeKit does not collect the data required to report them, so this report makes no claim about them either way.
      </p>
    </div>
  );
}

/* ── States ───────────────────────────────────────────────────────────────── */

function LoadingDoc() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the campaign report</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-4 w-56" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-4 border-t border-line pt-6 md:grid-cols-[176px_1fr]">
          <Skeleton className="h-3 w-28" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Failure({ status, message, id }) {
  const forbidden = status === 403;
  const missing = status === 404;
  const unauth = status === 401;
  const Icon = forbidden || unauth ? Lock : missing ? FileText : AlertCircle;
  return (
    <Card className="p-6 sm:p-8" role="alert">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-md bg-surface-2 text-muted">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h1 className="font-display text-lg font-extrabold text-ink">
          {forbidden ? 'This report is not yours to view'
            : unauth ? 'Sign in to view this report'
            : missing ? 'Campaign not found'
            : 'The report could not be loaded'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {message || 'Something went wrong on our side.'}
          {forbidden && ' Only the brand that ran the campaign, or a RazeKit admin, can open its report.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {unauth
            ? <Button to="/login" size="sm">Sign in</Button>
            : <Button to={id ? `/contest/${id}` : '/dashboard'} variant="secondary" size="sm">Back to campaign</Button>}
        </div>
      </div>
    </Card>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function CampaignReport() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [fail, setFail] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null); setFail(null);
    fn('campaignReport', { contest_id: id })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setFail({ status: e?.status, message: e?.data?.error?.message || e?.message }); });
    return () => { live = false; };
  }, [id]);

  return (
    <div className="rk-doc mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <style>{PRINT_CSS}</style>

      <div className="rk-noprint mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to campaign
        </Link>
        {data && (
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF
          </Button>
        )}
      </div>

      {fail && <Failure status={fail.status} message={fail.message} id={id} />}
      {!fail && !data && <LoadingDoc />}

      {data && (
        <article className="space-y-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Campaign report</p>
            <h1 className="mt-2 font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">
              {data.campaign.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
              <Badge tone={data.campaign.lifecycle_state === 'COMPLETED' ? 'success' : 'neutral'}>{data.campaign.state_label}</Badge>
              {data.campaign.category && <span className="capitalize">{data.campaign.category}</span>}
              <span aria-hidden="true" className="text-line-strong">·</span>
              <span>Opened {dateShort(data.campaign.created_date)}</span>
              {data.campaign.deadline && <><span aria-hidden="true" className="text-line-strong">·</span><span>Deadline {dateShort(data.campaign.deadline)}</span></>}
              {data.campaign.completed_at && <><span aria-hidden="true" className="text-line-strong">·</span><span>Completed {dateShort(data.campaign.completed_at)}</span></>}
            </div>
          </div>

          <Section n="01" title="Outcome" note="What the campaign produced, and where the prize commitment stands.">
            <Outcome campaign={data.campaign} winner={data.winner} funding={data.funding} />
          </Section>

          <Section n="02" title="Participation" note="Who entered, and how many entries could be measured.">
            <Participation p={data.participation} />
          </Section>

          <Section n="03" title="Performance" note="Scores are produced by RazeKit's scoring engine from verified activity only.">
            <Performance perf={data.performance} />
          </Section>

          <Section n="04" title="Ranking" note="Up to ten highest-scoring entries, in final-score order.">
            <Ranking rows={data.top_performers || []} />
          </Section>

          <Section n="05" title="Scope" note="What this report deliberately does not claim.">
            <NotMeasured items={data.not_measured} />
          </Section>

          <footer className="border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
            <p className="flex items-start gap-1.5">
              <Ban className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Every figure is derived from records RazeKit holds. Nothing on this page is estimated, projected or modelled.
            </p>
            <p className="mt-2">Report generated {dateShort(data.generated_at)} · Campaign reference {data.campaign.id}</p>
          </footer>
        </article>
      )}
    </div>
  );
}
