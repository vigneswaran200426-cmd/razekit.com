import { AlertTriangle, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { platformById } from '@/lib/submission/platforms';
import { buildChecklist } from '@/lib/submission/requirements';
import SubmissionChecklist from './SubmissionChecklist';

// Step 4 — Final Check. The creator reviews everything, sees exactly what is
// missing (submit is impossible while anything is), confirms originality and
// terms, then submits. Save Draft is visually distinct and never confusable.
export default function FinalCheckStep({
  contest, reqs, state, user, brandName,
  missing, submitting, onTermsChange, onSubmit, onSaveDraft,
}) {
  const checklist = buildChecklist(reqs, state, { includeTerms: true });
  const entries = (state.platforms || []).filter((e) => e.platformId);
  const postWinRequired = reqs.handover.required || reqs.collaboration.required;
  const canSubmit = missing.length === 0 && state.terms?.original && (!postWinRequired || state.terms?.postWin);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-heading text-sm font-bold mb-3">Review your submission</p>
        <div className="space-y-0.5">
          <Row label="Contest" value={contest.title} />
          <Row label="Brand" value={brandName} />
          <Row label="Creator" value={user?.full_name || user?.email} />
          <Row label="Platform" value={entries.map((e) => `${platformById(e.platformId)?.label || e.platformId}${e.contentType && platformById(e.platformId)?.contentTypes.length > 1 ? ` — ${e.contentType}` : ''}`).join(', ')} />
          <Row label="Files" value={state.final?.name ? `${state.final.name}${(state.sourceFiles || []).length ? ` + ${state.sourceFiles.length} source file${state.sourceFiles.length === 1 ? '' : 's'}` : ''}` : 'No files'} />
          {entries.filter((e) => e.fields?.live_url).map((e) => (
            <Row key={e.platformId} label="Live URL" value={`${platformById(e.platformId)?.label}: ${e.fields.live_url}`} />
          ))}
          {entries.some((e) => e.notPublished) && <Row label="Live URL" value="Not published yet — may be requested after approval" />}
          <Row label="Caption" value={(entries[0]?.fields?.caption || '').slice(0, 120)} />
          {reqs.requiredMentions.length > 0 && <Row label="Brand requires" value={`Mentions: ${reqs.requiredMentions.join(' ')}`} />}
          {reqs.requiredHashtags.length > 0 && <Row label="Brand requires" value={`Hashtags: ${reqs.requiredHashtags.join(' ')}`} />}
          <Row label="Source files" value={(state.sourceFiles || []).map((s) => s.label).join(', ') || 'None'} />
          {reqs.handover.required && <Row label="Handover" value={`Account / asset handover required${reqs.handover.type ? ` (${reqs.handover.type})` : ''} — applies only if you win`} />}
          {reqs.collaboration.required && <Row label="Collaboration" value="Winner collaboration required — applies only if you win" />}
          {!reqs.handover.required && !reqs.collaboration.required && <Row label="Post-win" value="Winner content review for the Winners Hub" />}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="font-heading text-sm font-bold mb-3">Submission checklist</p>
        <SubmissionChecklist items={checklist} />
      </div>

      {missing.length > 0 && (
        <div role="alert" className="bg-warning/10 border border-warning/30 rounded-2xl p-4">
          <p className="text-xs font-semibold text-[#D78C05] flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-4 h-4" />
            {missing.length} item{missing.length === 1 ? '' : 's'} required before submission:
          </p>
          <ul className="space-y-1">
            {missing.map((m) => <li key={m} className="text-xs text-foreground/90 list-disc list-inside">{m}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={Boolean(state.terms?.original)} onChange={(e) => onTermsChange({ original: e.target.checked })} className="mt-0.5" />
          <span className="text-xs leading-relaxed">
            I confirm that this submission is my original work and follows the contest brief and submission requirements.
          </span>
        </label>
        {postWinRequired && (
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={Boolean(state.terms?.postWin)} onChange={(e) => onTermsChange({ postWin: e.target.checked })} className="mt-0.5" />
            <span className="text-xs leading-relaxed">
              I understand that post-win {reqs.handover.required ? 'handover' : 'collaboration'} requirements apply according to the contest terms.
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onSubmit} disabled={!canSubmit || submitting} size="lg" className="w-full">
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit Final Work'}
        </Button>
        <Button onClick={onSaveDraft} variant="outline" className="w-full">
          <Save className="w-4 h-4" /> Save Draft
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Once submitted, this version goes to the brand for review. You&rsquo;ll be able to submit a new version if a revision is requested.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-foreground min-w-0 break-words">{value}</span>
    </div>
  );
}