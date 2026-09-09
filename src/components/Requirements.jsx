// Contest requirements + compliance result (spec 17/18).
//
// Creators see exactly what they are held to, and — if a submission is not
// eligible — the specific requirement and the evidence. It never exposes
// internal detection thresholds or fraud logic.
import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, HelpCircle } from 'lucide-react';
import { fn } from '@/lib/api';
import { Card, Badge, Skeleton, EmptyState } from '@/components/ui';

const FINDING_UI = {
  pass: { icon: CheckCircle2, tone: 'success', label: 'Met' },
  fail: { icon: XCircle, tone: 'danger', label: 'Not met' },
  review_required: { icon: Clock, tone: 'warning', label: 'Being reviewed' },
  not_evaluable: { icon: HelpCircle, tone: 'neutral', label: 'Needs review' },
};

const ELIGIBILITY_UI = {
  eligible: { tone: 'success', title: 'Eligible for winner selection', icon: CheckCircle2 },
  ineligible: { tone: 'danger', title: 'Not eligible', icon: XCircle },
  review_required: { tone: 'warning', title: 'Being reviewed', icon: Clock },
  pending: { tone: 'neutral', title: 'Not checked yet', icon: Clock },
};

/** The contest's locked rules. Shown to creators BEFORE they submit. */
export function ContestRequirements({ contestId, compact = false }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!contestId) return;
    fn('criteriaGet', { contest_id: contestId }).then(setData).catch(() => setData({ confirmed: false, criteria: [] }));
  }, [contestId]);

  if (!data) return <Skeleton className="h-40 rounded-lg" />;
  if (!data.confirmed || !data.criteria.length) return null;

  const mandatory = data.criteria.filter((c) => c.mandatory);
  const guidance = data.criteria.filter((c) => !c.mandatory);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Contest requirements</h2>
        <Badge tone="primary">{mandatory.length} mandatory</Badge>
      </div>

      {mandatory.length > 0 && (
        <ul className="space-y-2">
          {mandatory.map((c) => (
            <li key={c.id || c.key} className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
              <span className="text-sm text-ink leading-snug">
                {c.label}
                {c.description && !compact && <span className="block text-[12px] text-muted">{c.description}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!compact && guidance.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Also expected</p>
          <ul className="space-y-1">
            {guidance.map((c) => (
              <li key={c.id || c.key} className="text-[13px] text-muted">{c.label}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-muted">
        Your submission will be checked against these contest requirements before it becomes eligible for winner selection.
      </p>
    </Card>
  );
}

/** The result of that check for one submission, with the rejection reason. */
export function ComplianceResult({ submissionId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!submissionId) return;
    fn('complianceGet', { submission_id: submissionId }).then(setData).catch(() => setData(null));
  }, [submissionId]);

  if (!data) return null;
  if (data.status === 'pending' && !(data.findings || []).length) return null;

  const ui = ELIGIBILITY_UI[data.status] || ELIGIBILITY_UI.pending;
  const Icon = ui.icon;
  const failed = (data.findings || []).filter((f) => f.mandatory && f.status === 'fail');
  const reviewing = (data.findings || []).filter((f) => f.mandatory && (f.status === 'review_required' || f.status === 'not_evaluable'));

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <Icon className={`w-4.5 h-4.5 text-${ui.tone}`} aria-hidden="true" /> {ui.title}
        </h2>
        <Badge tone={ui.tone}>{String(data.status).replace('_', ' ')}</Badge>
      </div>

      {data.status === 'ineligible' && (
        <div className="rounded-lg border border-danger/25 bg-danger/[0.05] p-4 space-y-2">
          <p className="text-[13px] font-semibold text-ink">Your submission does not meet a mandatory contest requirement.</p>
          {failed.map((f) => (
            <div key={f.id} className="text-[13px]">
              <p className="text-ink"><span className="font-medium">Requirement:</span> {f.criterion_label}</p>
              {f.evidence && <p className="text-muted"><span className="font-medium">Why:</span> {f.evidence}</p>}
            </div>
          ))}
        </div>
      )}

      {data.status === 'review_required' && (
        <div className="rounded-lg border border-warning/30 bg-warning/[0.06] p-4">
          <p className="text-[13px] text-ink">
            {reviewing.length} requirement{reviewing.length === 1 ? '' : 's'} need a person to check {reviewing.length === 1 ? 'it' : 'them'}.
            You do not need to do anything right now.
          </p>
        </div>
      )}

      <ul className="space-y-1.5">
        {(data.findings || []).map((f) => {
          const fu = FINDING_UI[f.status] || FINDING_UI.not_evaluable;
          const FIcon = fu.icon;
          return (
            <li key={f.id} className="flex items-start gap-2">
              <FIcon className={`w-4 h-4 shrink-0 mt-0.5 text-${fu.tone}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">
                  {f.criterion_label}
                  {f.mandatory && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-danger">required</span>}
                </span>
                {f.evidence && <span className="block text-[12px] text-muted leading-snug">{f.evidence}</span>}
              </span>
              <Badge tone={fu.tone}>{fu.label}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
