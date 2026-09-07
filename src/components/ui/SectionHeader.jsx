import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Section title with optional "View all"-style action link.
export default function SectionHeader({ title, actionLabel, onAction, to, icon: Icon, className }) {
  const content = (
    <>
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-primary" />}
        {title}
      </h2>
      {actionLabel && (
        <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
          {actionLabel} <ArrowRight className="w-3 h-3" />
        </span>
      )}
    </>
  );
  return (
    <div className={cn('flex items-center justify-between mb-2.5', className)}>
      {to ? <a href={to} className="contents">{content}</a> : onAction ? <button onClick={onAction} className="contents">{content}</button> : content}
    </div>
  );
}