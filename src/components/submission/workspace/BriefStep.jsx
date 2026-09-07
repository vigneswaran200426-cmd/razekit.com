import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, History, Info, ShieldCheck, Users } from 'lucide-react';
import { safeParse } from '@/lib/submission/requirements';
import { SUBMISSION_STATUS_LABELS } from '@/lib/submission/state-machine';
import { platformById } from '@/lib/submission/platforms';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-foreground min-w-0">{value}</span>
    </div>
  );
}

// Step 1 — Understand the brief. Compact, derived from the real contest
// configuration. The creator can always return to the full brief.
export default function BriefStep({ contest, reqs, versions = [], onNext }) {
  const deliverables = safeParse(contest.deliverables);
  const platformLabels = (reqs.freePlatformChoice ? [] : reqs.platforms).map((id) => platformById(id)?.label).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-heading text-sm font-bold mb-2">Campaign brief</p>
        <Row label="Objective" value={contest.short_description || contest.description} />
        {contest.brief && (
          <Row label="What the brand wants" value={<span className="line-clamp-3">{String(contest.brief).replace(/<[^>]*>/g, ' ').slice(0, 400)}{String(contest.brief).length > 400 ? '…' : ''}</span>} />
        )}
        <Row label="Platforms" value={platformLabels.length ? platformLabels.join(', ') : 'Your choice of platform'} />
        {deliverables.length > 0 && (
          <div className="py-2 border-b border-border/50 last:border-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Deliverables</p>
            <div className="space-y-1.5">
              {deliverables.slice(0, 6).map((d, i) => (
                <p key={i} className="text-xs text-foreground/90">
                  {d.name || d.contentType || 'Deliverable'}
                  {d.duration ? ` · ${d.duration}` : ''}{d.ratio ? ` · ${d.ratio}` : ''}
                  {d.resolution ? ` · ${d.resolution}` : ''}{d.format ? ` · ${d.format}` : ''}
                  {d.quantity ? ` · ×${d.quantity}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}
        <Row label="Duration" value={reqs.maxDurationSec ? `Up to ${reqs.maxDurationSec}s` : null} />
        <Row label="Aspect ratio" value={reqs.aspectRatios.join(' or ')} />
        <Row label="Required mentions" value={reqs.requiredMentions.join(' ')} />
        <Row label="Required hashtags" value={reqs.requiredHashtags.join(' ')} />
        <Row label="CTA" value={reqs.requiredCTA} />
        <Row label="Source files" value={reqs.sourceFiles.filter((f) => f.id !== 'final').some((f) => f.required) ? 'Required source files — see Your Work step' : 'Not required'} />
        <Row label="Live URL" value={reqs.requireLiveUrl ? 'A live/published URL is required' : 'Optional — can be provided after approval'} />
        <Row label="Deadline" value={new Date(contest.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} />
        <div className="pt-2">
          <Link to={`/contest/${contest.id}`} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
            View full brief <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-heading text-sm font-bold mb-2">After winning</p>
        {reqs.handover.required && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-2">
            <p className="text-xs font-semibold flex items-center gap-1.5 mb-1"><ShieldCheck className="w-4 h-4 text-primary" /> Account / Asset handover required</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If selected as the winner, you may need to hand over the specified account, files, assets or access according to the contest terms.
              {reqs.handover.type ? ` Type: ${reqs.handover.type}.` : ''}
              {reqs.handover.deadline ? ` Deadline: ${reqs.handover.deadline}.` : ''}
            </p>
          </div>
        )}
        {reqs.collaboration.required && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-2">
            <p className="text-xs font-semibold flex items-center gap-1.5 mb-1"><Users className="w-4 h-4 text-primary" /> Winner collaboration required</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {reqs.collaboration.responsibilities || 'The brand may request creator participation, additional content, revisions or promotional material.'}
              {reqs.collaboration.duration ? ` Duration: ${reqs.collaboration.duration}.` : ''}
            </p>
          </div>
        )}
        {!reqs.handover.required && !reqs.collaboration.required && (
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            No handover or collaboration required. After winning: payment, then winner content review for the Winners Hub.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Post-win steps become active only after the brand selects a winner — nothing is transferred during submission.
        </p>
      </div>

      {versions.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="font-heading text-sm font-bold flex items-center gap-1.5 mb-2"><History className="w-4 h-4 text-muted-foreground" /> Your submitted versions</p>
          <div className="space-y-1.5">
            {versions.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-xl px-3 py-2">
                <p className="text-xs font-medium">Version {v.version || versions.length - i}</p>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {v.submitted_at && new Date(v.submitted_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    {i === 0 && <CheckCircle2 className="w-3 h-3 text-primary" aria-label="Current" />}
                    {SUBMISSION_STATUS_LABELS[v.status] || v.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}