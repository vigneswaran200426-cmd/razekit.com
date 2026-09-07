import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lightweight centered modal shared by the social tracker dialogs.
// Sheet-style on mobile, centered card on desktop.
export default function SimpleModal({ open, onClose, title, subtitle, children, className }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#0C2444]/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full sm:max-w-md bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl shadow-glass-lg max-h-[88vh] overflow-y-auto', className)}>
        <div className="sticky top-0 bg-card/95 backdrop-blur px-5 pt-5 pb-3 border-b border-border/60 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading font-bold">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}