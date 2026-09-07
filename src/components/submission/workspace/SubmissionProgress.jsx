import { Check } from 'lucide-react';

const STEPS = ['Brief', 'Your Work', 'Platform Details', 'Final Check', 'Submitted'];

// Compact 5-step progress indicator — a simple numbered flow, not a
// gaming level system.
export default function SubmissionProgress({ current }) {
  return (
    <ol className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1" aria-label="Submission progress">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-1.5 shrink-0" aria-current={active ? 'step' : undefined}>
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                done ? 'bg-success text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" aria-label="Completed" /> : i + 1}
            </span>
            <span className={`text-[11px] font-medium whitespace-nowrap ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s}
            </span>
            {i < STEPS.length - 1 && <span className={`w-4 h-px ${done ? 'bg-success' : 'bg-border'}`} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}