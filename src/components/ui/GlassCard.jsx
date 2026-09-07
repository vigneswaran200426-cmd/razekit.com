import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

// Premium translucent Razekit glass card with soft fade-up entrance.
// `delay` staggers groups; `hover` adds subtle elevation on pointer over.
export default function GlassCard({ className, children, delay = 0, animate = true, hover = false, ...props }) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      whileHover={hover ? { y: -2, boxShadow: '0 8px 24px -6px rgba(12,36,68,0.14)' } : undefined}
      className={cn('glass-card rounded-2xl', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}