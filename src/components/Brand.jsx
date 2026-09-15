// RazeKit brand lockup — the locked mark (blue diagonal stacked parallelograms)
// + wordmark ("Raze" in ink, "kit" in brand blue).
//
// THE DESIGN IS LOCKED. Do not change the geometry, the stacking order, the
// skew, or the wordmark text. What changed here is only the implementation,
// which had three real defects:
//
//   1. the mark was three absolutely-positioned <div>s with inline gradients,
//      so it blurred on fractional scaling and could not inherit anything.
//      It is now one SVG with the same geometry as public/favicon.svg — the
//      tab icon and the in-app mark are finally the same drawing.
//   2. the wordmark hard-coded #0d1b3a, so "Raze" went near-invisible on a dark
//      surface. It now uses the ink token and inherits the theme.
//   3. `className` was accepted by RazekitLogo but silently dropped by
//      RazekitWordmark, so `<RazekitWordmark className="h-5" />` in the footer
//      did nothing at all.
//
// Motion: a subtle entrance on mount, and a one-shot pulse ONLY on a real
// event (submission, payment, winner, security). Never a loop, and fully inert
// under prefers-reduced-motion.
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1];

/** Fire a one-shot logo reaction from anywhere: pulseLogo('winner'). */
export function pulseLogo(kind = 'success') {
  try {
    window.dispatchEvent(new CustomEvent('razekit:logo-pulse', { detail: { kind } }));
  } catch { /* no window (SSR/test) — a logo flourish is never worth throwing for */ }
}

function useLogoPulse() {
  const [pulse, setPulse] = useState(null);
  useEffect(() => {
    let timer;
    const onPulse = (e) => {
      setPulse(e?.detail?.kind || 'success');
      // The previous version returned the cleanup from the LISTENER, where
      // nothing could ever call it, so rapid events leaked timers and could
      // clear a newer pulse. The timer is owned by the effect now.
      clearTimeout(timer);
      timer = setTimeout(() => setPulse(null), 620);
    };
    window.addEventListener('razekit:logo-pulse', onPulse);
    return () => {
      window.removeEventListener('razekit:logo-pulse', onPulse);
      clearTimeout(timer);
    };
  }, []);
  return pulse;
}

/**
 * The mark. Same geometry as public/favicon.svg, drawn once as SVG so it stays
 * crisp at 20px in a header and at 200px on a splash.
 *
 * Gradient ids are suffixed per instance: two marks on one page with the same
 * id would make the second one silently adopt the first one's fills.
 */
export function RazekitMark({ size = 32, className = '', title }) {
  const [uid] = useState(() => `rk${Math.random().toString(36).slice(2, 9)}`);
  return (
    <svg
      width={size}
      height={(32 / 44) * size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2f5e" /><stop offset="1" stopColor="#0d1b3a" />
        </linearGradient>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f7bf5" /><stop offset="1" stopColor="#0f47c2" />
        </linearGradient>
        <linearGradient id={`${uid}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#31d3ff" /><stop offset="1" stopColor="#1479f5" />
        </linearGradient>
      </defs>
      <g transform="skewX(-20)">
        <rect x="6" y="30" width="20" height="10" rx="2" fill={`url(#${uid}a)`} />
        <rect x="14" y="19" width="20" height="10" rx="2" fill={`url(#${uid}b)`} />
        <rect x="22" y="8" width="20" height="10" rx="2" fill={`url(#${uid}c)`} />
      </g>
    </svg>
  );
}

/**
 * The wordmark. "Raze" takes the ink token so it survives a dark surface;
 * "kit" stays brand blue, which reads on both.
 */
export function RazekitWordmark({ size = 22, className = '' }) {
  return (
    <span
      className={`font-display font-extrabold leading-none tracking-[-0.03em] text-ink ${className}`}
      style={{ fontSize: size }}
    >
      Raze<span className="text-primary">kit</span>
    </span>
  );
}

export function RazekitLogo({ mark = 32, word = 22, className = '', showWord = true }) {
  const reduce = useReducedMotion();
  const pulse = useLogoPulse();

  const lockup = (
    <>
      <RazekitMark size={mark} />
      {showWord && <RazekitWordmark size={word} />}
    </>
  );

  // Reduced motion: the lockup, statically. No entrance, no pulse.
  if (reduce) {
    return <span className={`inline-flex items-center gap-2.5 ${className}`}>{lockup}</span>;
  }

  // Deliberately restrained. A logo that keeps moving stops being a logo and
  // starts being a distraction; each of these fires once and settles.
  const reaction =
    pulse === 'winner' ? { scale: [1, 1.09, 1], rotate: [0, -2, 0] }
      : pulse === 'security' ? { scale: [1, 1.05, 1, 1.05, 1] }
        : pulse ? { scale: [1, 1.06, 1] }
          : { scale: 1, rotate: 0 };

  return (
    <motion.span
      className={`inline-flex items-center gap-2.5 ${className}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
    >
      <motion.span
        animate={reaction}
        transition={{ duration: pulse ? 0.6 : 0.2, ease: EASE }}
        style={{ display: 'inline-flex' }}
      >
        <RazekitMark size={mark} />
      </motion.span>
      {showWord && <RazekitWordmark size={word} />}
    </motion.span>
  );
}
