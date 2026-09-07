import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Clean progress/step indicator: completed, current, and upcoming steps.
export default function ProgressStepper({ steps, current, className }) {
  return (
    <div className={cn('flex items-start w-full', className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className={cn('flex-1 flex flex-col items-center relative', i === steps.length - 1 && 'flex-none')}>
            {i > 0 && (
              <div className={cn('absolute top-3.5 right-1/2 left-0 h-0.5 rounded-full -z-0', done ? 'bg-primary' : 'bg-border')} />
            )}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.06, duration: 0.35 }}
              className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors',
                done ? 'bg-primary text-primary-foreground'
                : active ? 'bg-primary/10 text-primary ring-2 ring-primary/30'
                : 'bg-secondary text-muted-foreground')}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </motion.div>
            <span className={cn('text-[11px] mt-1.5 text-center max-w-[80px] leading-tight', active ? 'text-primary font-semibold' : 'text-muted-foreground')}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}