import { Check, Circle } from 'lucide-react';

// Live submission checklist — rendered from the derived requirements,
// shared by the right rail and the final check. State is never shown
// by color alone: each row carries text and an icon.
export default function SubmissionChecklist({ items, compact = false }) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2">
          {item.done ? (
            <Check className="w-4 h-4 text-success shrink-0 mt-0.5" aria-label="Done" />
          ) : (
            <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" aria-label={item.skip ? 'Not applicable' : 'To do'} />
          )}
          <span className={`text-xs leading-snug ${item.done ? 'text-foreground' : item.skip ? 'text-muted-foreground/50 line-through' : 'text-muted-foreground'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}