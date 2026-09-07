import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

// Vertical workflow timeline for staged processes (e.g. account handover).
// steps: [{ title, description, state: 'done' | 'current' | 'pending' | 'alert' }]
export default function Timeline({ steps, className }) {
  return (
    <div className={cn('space-y-0', className)}>
      {steps.map((step, i) => {
        const isDone = step.state === 'done';
        const isCurrent = step.state === 'current';
        const isAlert = step.state === 'alert';
        return (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: i * 0.06 }}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10',
                isDone ? 'bg-primary text-primary-foreground'
                : isCurrent ? 'bg-primary/10 text-primary ring-2 ring-primary/30'
                : isAlert ? 'bg-warning/10 text-[#D78C05] ring-2 ring-warning/30'
                : 'bg-secondary text-muted-foreground')}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
              </div>
              {i < steps.length - 1 && (
                <div className={cn('w-0.5 flex-1 min-h-[24px] rounded-full', isDone ? 'bg-primary/40' : 'bg-border')} />
              )}
            </div>
            <div className={cn('flex-1 pb-5', i === steps.length - 1 && 'pb-0')}>
              <p className={cn('text-sm font-semibold', isCurrent ? 'text-primary' : 'text-foreground')}>
                {step.title}
              </p>
              {step.description && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}