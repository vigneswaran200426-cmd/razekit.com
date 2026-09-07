// Razekit motion system — moderate, Apple + Linear feel.
// Card entrances: opacity 0→1, translate 8px→0, 350–550ms, 50–80ms stagger.
export const EASE = [0.22, 1, 0.36, 1];

// Single element entrance (fade + 8px rise)
export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE, delay },
});

// Parent that staggers its MotionChildren children (50–80ms)
export const staggerParent = (stagger = 0.06, delayChildren = 0) => ({
  initial: 'hidden',
  animate: 'visible',
  variants: {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren } },
  },
});

// Child variant used inside a stagger parent
export const staggerChild = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

// Page transition: fade + small upward movement, 300ms
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// Button motion (hover elevation + tiny press scale-down)
export const buttonMotion = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
};