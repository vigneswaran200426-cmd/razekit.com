import { Check } from 'lucide-react';

const STEPS = [
  'Winner Selected',
  'Handover Initiated',
  'Access / Assets Delivered',
  'Winner Confirms',
  'Brand Confirms',
  'Payment Released',
  'Completed',
];

// Focused progress indicator shown at the top of every handover screen.
export default function HandoverProgress({ handover, contest }) {
  const h = handover || {};
  const done = [
    true,
    !!h.started_at,
    ['in_progress', 'winner_confirmed', 'client_confirmed', 'completed'].includes(h.status) || !!h.client_confirmation,
    !!h.creator_confirmation,
    !!h.client_confirmation,
    !!h.completed_at || contest?.status === 'completed',
    h.status === 'completed' && contest?.status === 'completed',
  ];
  const activeIdx = done.findIndex((d) => !d);

  return (
    <div className="glass-card rounded-2xl p-3">
      <div className="grid grid-cols-7 gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-1 min-w-0">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                done[i]
                  ? 'bg-primary text-primary-foreground'
                  : i === activeIdx
                    ? 'border-2 border-primary text-primary'
                    : 'border border-border text-muted-foreground'
              }`}
            >
              {done[i] ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-[8px] md:text-[9px] text-center leading-tight ${
                done[i] || i === activeIdx ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}