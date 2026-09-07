import { cn } from '@/lib/utils';

// Rounded Razekit status chip.
const TONES = {
  neutral: 'bg-secondary text-[#0C2444]',
  info: 'bg-primary/10 text-primary',
  accent: 'bg-accent/25 text-[#0C2444]',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-[#D78C05]',
  danger: 'bg-destructive/10 text-destructive',
};

export default function StatusPill({ tone = 'neutral', icon: Icon, children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide', TONES[tone], className)}>
      {Icon && <Icon className="w-3 h-3 shrink-0" />}
      {children}
    </span>
  );
}