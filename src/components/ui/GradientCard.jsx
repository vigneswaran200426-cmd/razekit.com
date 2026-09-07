import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';

// Featured blue-gradient card (Action → Deep) for banners and hero content.
export default function GradientCard({ className, children, delay = 0, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      whileHover={{ y: -2 }}
      className={cn('bg-razekit-gradient text-white rounded-3xl shadow-primary-glow', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}