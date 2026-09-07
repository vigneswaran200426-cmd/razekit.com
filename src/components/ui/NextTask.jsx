import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import CountdownTimer from '@/components/CountdownTimer';

/*
  "Up next" — the single current task as a full-width asymmetric band.
  The action itself is the headline; the affordance is a single arrow.
  Gradient is reserved for celebration states; otherwise a quiet tinted band.
*/
export default function NextTask({ icon: Icon, label, context, hint, to, deadline, highlight = false, className }) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-4 md:gap-5 rounded-2xl p-4 md:px-6 md:py-5 transition-all duration-200 ease-brand hover:-translate-y-px active:scale-[0.99]',
        highlight
          ? 'bg-razekit-gradient text-white shadow-primary-glow'
          : 'border border-primary/15 bg-primary/[0.05] hover:border-primary/30 hover:bg-primary/[0.08]',
        className
      )}
    >
      {Icon && (
        <span className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          highlight ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
        )}>
          <Icon className="w-[18px] h-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-[10px] font-bold uppercase tracking-[0.16em]', highlight ? 'text-white/80' : 'text-primary/70')}>
          Up next
        </p>
        <p className="font-heading font-bold text-base md:text-lg leading-tight truncate mt-0.5">{label}</p>
        <p className={cn('text-xs truncate mt-0.5', highlight ? 'text-white/75' : 'text-muted-foreground')}>
          {context}{hint ? ` · ${hint}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {deadline && (
          <span className={cn('hidden sm:flex items-center gap-1 text-xs font-medium nums', highlight ? 'text-white/85' : 'text-muted-foreground')}>
            <Clock className="w-3.5 h-3.5" /><CountdownTimer deadline={deadline} />
          </span>
        )}
        <span className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ease-brand group-hover:translate-x-0.5',
          highlight ? 'bg-white text-primary' : 'bg-primary text-primary-foreground shadow-sm group-hover:bg-[#0B48E8]'
        )}>
          <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  );
}