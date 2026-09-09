// RazeKit brand lockup — the locked mark (blue diagonal stacked parallelograms)
// + wordmark ("Raze" navy, "kit" blue). Do not alter the mark or the wordmark text.
//
// Motion (spec 19): a subtle entrance on page load, and a tiny pulse ONLY on
// meaningful events (submission, payment, winner, security). Never a loop.
// Everything here is inert under prefers-reduced-motion.
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1];

/** Fire a one-shot logo reaction from anywhere: pulseLogo('winner'). */
export function pulseLogo(kind = 'success') {
  try {
    window.dispatchEvent(new CustomEvent('razekit:logo-pulse', { detail: { kind } }));
  } catch {}
}

function useLogoPulse() {
  const [pulse, setPulse] = useState(null);
  useEffect(() => {
    const onPulse = (e) => {
      setPulse(e?.detail?.kind || 'success');
      const t = setTimeout(() => setPulse(null), 620);
      return () => clearTimeout(t);
    };
    window.addEventListener('razekit:logo-pulse', onPulse);
    return () => window.removeEventListener('razekit:logo-pulse', onPulse);
  }, []);
  return pulse;
}

export function RazekitMark({ size = 32 }) {
  const u = size / 44;
  const cell = { position: 'absolute', width: 23 * u, height: 12 * u, transform: 'skewX(-22deg)', borderRadius: 2 };
  return (
    <div style={{ position: 'relative', width: size, height: (32 / 44) * size }} aria-hidden="true">
      <div style={{ ...cell, left: 0, top: 20 * u, background: 'linear-gradient(135deg,#1b2f5e,#0d1b3a)' }} />
      <div style={{ ...cell, left: 10 * u, top: 10 * u, background: 'linear-gradient(135deg,#2f7bf5,#0f47c2)' }} />
      <div style={{ ...cell, left: 20 * u, top: 0, background: 'linear-gradient(135deg,#31d3ff,#1479f5)' }} />
    </div>
  );
}

export function RazekitWordmark({ size = 22 }) {
  return (
    <span style={{ fontFamily: '"Inter Tight", Inter, sans-serif', fontSize: size, fontWeight: 800, letterSpacing: '-0.03em', color: '#0d1b3a', lineHeight: 1 }}>
      Raze<span style={{ color: '#1479f5' }}>kit</span>
    </span>
  );
}

export function RazekitLogo({ mark = 32, word = 22, className = '' }) {
  const reduce = useReducedMotion();
  const pulse = useLogoPulse();

  // Reduced motion: render the lockup statically, no entrance, no pulse.
  if (reduce) {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <RazekitMark size={mark} />
        <RazekitWordmark size={word} />
      </span>
    );
  }

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
      <RazekitWordmark size={word} />
    </motion.span>
  );
}
