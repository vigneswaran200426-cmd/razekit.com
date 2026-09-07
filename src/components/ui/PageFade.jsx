import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { pageVariants, staggerParent, staggerChild } from '@/lib/motion';

// Page-level transition wrapper: fade + small upward movement.
export default function PageFade({ children, className }) {
  return (
    <motion.div className={className} {...pageVariants}>
      {children}
    </motion.div>
  );
}

// Container that staggers its MotionChild children (50–80ms).
export function MotionList({ children, className, stagger = 0.06 }) {
  return (
    <motion.div className={className} {...staggerParent(stagger)}>
      {children}
    </motion.div>
  );
}

// Child of MotionList — inherits the stagger.
export function MotionChild({ children, className }) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}