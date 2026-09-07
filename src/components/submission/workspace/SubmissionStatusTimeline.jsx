import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

// Submission status tracker — renders the dynamic timeline derived from the
// state machine. Only relevant states appear (post-win steps come from the
// contest's configured path). Status is never color-only: every node has a
// label and an icon, with screen-reader text.
export default function SubmissionStatusTimeline({ steps }) {
  return (
    <ol className="space-y-0" aria-label="Submission status timeline">
      {steps.map((s, i) => (
        <li key={s.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border" aria-hidden>
              {s.status === 'done' && <CheckCircle2 className="w-4 h-4 text-success" />}
              {s.status === 'current' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
              {s.status === 'pending' && <Circle className="w-3.5 h-3.5 text-muted-foreground/30" />}
            </span>
            {i < steps.length - 1 && <span className={`w-px flex-1 min-h-[16px] ${s.status === 'done' ? 'bg-success/40' : 'bg-border'}`} aria-hidden />}
          </div>
          <div className="pb-4">
            <p className={`text-xs font-semibold ${s.status === 'pending' ? 'text-muted-foreground/50' : 'text-foreground'}`}>
              {s.label}
              <span className="sr-only"> — {s.status === 'done' ? 'completed' : s.status === 'current' ? 'current stage' : 'upcoming'}</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}