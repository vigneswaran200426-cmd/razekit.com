import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import SubmissionStatusTimeline from './SubmissionStatusTimeline';
import { submissionTimeline } from '@/lib/submission/state-machine';

// Step 5 — premium confirmation screen. States the facts (submitted, brand
// review next) without ever implying the creator won.
export default function SubmissionSuccess({ contest, submission, brandName }) {
  const refId = `RK-${String(submission?.id || '').slice(-6).toUpperCase() || '—'}`;
  const steps = submissionTimeline({ submission, contest });

  return (
    <div className="max-w-xl mx-auto py-6 animate-fade-in">
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-success" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Submission received</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your work has been successfully submitted to <span className="text-foreground font-medium">{contest.title}</span>
          {brandName ? ` by ${brandName}` : ''}.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Submission ID: <span className="font-semibold text-foreground">{refId}</span> · Status: Submitted
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold mb-1">Next: Brand review</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The Brand may review your work, shortlist it, request clarification, or select a winner. You&rsquo;ll be notified
          at every step — no action is needed from you right now.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-6">
        <p className="text-xs font-semibold mb-3">What happens next</p>
        <SubmissionStatusTimeline steps={steps} />
      </div>

      <Link
        to={`/contest/${contest.id}`}
        className="flex items-center justify-between bg-primary text-primary-foreground rounded-2xl px-5 py-3.5 hover:bg-[#0B48E8] transition-colors"
      >
        <span className="text-sm font-semibold">Back to contest</span>
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}