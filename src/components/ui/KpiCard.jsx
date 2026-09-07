import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

// Rounded dashboard KPI card with soft fade-up entrance.
export default function KpiCard({ icon: Icon, label, value, hint, delay = 0, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className={cn('glass-card rounded-2xl p-5', className)}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className="font-heading text-3xl font-bold leading-none text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-primary font-medium mt-1">{hint}</p>}
      {Icon && (
        <div className="mt-3 flex items-center gap-1.5 text-primary/60">
          <Icon className="w-3.5 h-3.5" />
        </div>
      )}
    </motion.div>
  );
}