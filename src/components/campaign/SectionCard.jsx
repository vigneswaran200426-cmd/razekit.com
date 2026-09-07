import { ChevronDown, Check } from 'lucide-react';

// Expandable numbered section of the campaign brief.
export default function SectionCard({ id, number, title, subtitle, open, onToggle, done, optional, children }) {
  return (
    <section id={id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-accent/5 transition-colors">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${done ? 'bg-accent text-accent-foreground' : 'bg-accent/10 text-accent'}`}>
          {done ? <Check className="w-4 h-4" /> : number}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-heading font-semibold leading-tight">{title}</span>
          {subtitle && <span className="block text-xs text-muted-foreground truncate">{subtitle}</span>}
        </span>
        {optional && !done && <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 hidden sm:inline">Optional</span>}
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-4 border-t border-border/60">{children}</div>}
    </section>
  );
}