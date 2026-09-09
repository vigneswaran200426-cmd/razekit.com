import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { RazekitLogo } from '@/components/Brand';

// One shared entrance curve for every auth screen: a single quiet lift, no bounce.
const EASE = [0.22, 1, 0.36, 1];

/** Hairline rule with a centred label — used between the OAuth button and the email form. */
export function AuthDivider({ label = 'or' }) {
  return (
    <div className="relative my-6 text-center" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <span className="relative z-10 bg-bg px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

// Split auth layout: quiet brand panel + focused form. Boxy, premium.
export default function AuthShell({ title, subtitle, children, footer }) {
  const reduce = useReducedMotion();
  const enter = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, ease: EASE },
      };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg">
      {/* Brand panel — dropped below lg so the form owns the whole viewport on mobile. */}
      <aside
        className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ background: 'radial-gradient(120% 90% at 15% 0%, #12306b 0%, #0b1c3f 55%, #081428 100%)' }}
      >
        <Link to="/" className="relative z-10 inline-flex" aria-label="RazeKit home">
          <RazekitLogo mark={34} word={24} className="[&_span]:!text-white" />
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-extrabold text-white leading-[1.1] tracking-tight">
            Create. Compete. <span className="text-[#4c9bff]">Win.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            The creator contest marketplace where brands brief real work, creators compete on it, and winners get paid in public.
          </p>
          <ul className="mt-8 flex gap-8">
            {[['Open', 'live contests'], ['Verified', 'creators'], ['Secure', 'payouts']].map(([a, b]) => (
              <li key={b}>
                <p className="font-display text-lg font-bold text-white">{a}</p>
                <p className="text-xs text-white/50">{b}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="absolute -bottom-24 -right-16 w-96 h-96 rounded-full bg-[#1e56c9]/40 blur-3xl" aria-hidden="true" />
      </aside>

      {/* Form */}
      <main className="flex flex-col justify-center px-6 sm:px-10 py-12">
        <motion.div {...enter} className="w-full max-w-sm mx-auto">
          <div className="lg:hidden mb-8">
            <Link to="/" className="inline-flex" aria-label="RazeKit home">
              <RazekitLogo mark={32} word={22} />
            </Link>
          </div>

          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-sm text-muted text-center">{footer}</div>}
        </motion.div>
      </main>
    </div>
  );
}
