import { CheckCircle2, Globe2 } from 'lucide-react';

// "Who can compete for this prize?" — India only for now.
// The Global/USD path is display-disabled ("Coming soon") and sets nothing.
export default function SettlementRegionPicker({ data, update }) {
  const isIndia = (data.settlement_region || 'IN') === 'IN';

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">Who can compete for this prize?</p>
      <button
        type="button"
        onClick={() => update({ settlement_region: 'IN', currency: 'INR' })}
        className={`w-full flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
          isIndia ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/40'
        }`}
      >
        <CheckCircle2 className={`w-4 h-4 shrink-0 ${isIndia ? 'text-accent' : 'text-muted-foreground/40'}`} />
        <span className="text-sm font-medium flex-1">India creators (INR ₹)</span>
        {isIndia && <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent/10 text-accent font-semibold">Selected</span>}
      </button>
      <button
        type="button"
        disabled
        className="w-full flex items-center gap-2.5 rounded-xl border border-border p-3 text-left opacity-60 cursor-not-allowed"
      >
        <Globe2 className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1 text-muted-foreground">Global creators (USD $)</span>
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-semibold">Coming soon</span>
      </button>
    </div>
  );
}