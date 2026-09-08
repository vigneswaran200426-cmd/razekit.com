import React from 'react';
import { Check } from 'lucide-react';

/** Compact, shared workflow progress used on high-stakes RazeKit flows. */
export default function WorkflowSteps({ steps = [], current = 0 }) {
  return (
    <div className="surface p-3 md:p-4" aria-label="Workflow progress">
      <div className="flex items-center overflow-x-auto scrollbar-hide">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <React.Fragment key={step.label}>
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold ${
                    done ? 'border-primary bg-primary text-primary-foreground' :
                    active ? 'border-primary bg-primary/10 text-primary' :
                    'border-border bg-white text-muted-foreground'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </div>
                <span className={`text-xs font-semibold ${active ? 'text-foreground' : done ? 'text-primary' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && <div className={`mx-2 h-px min-w-6 flex-1 ${done ? 'bg-primary/50' : 'bg-border'}`} />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
