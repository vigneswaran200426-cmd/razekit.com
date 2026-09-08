import { Link } from 'react-router-dom';
import { RazekitLogo } from '@/components/Brand';

// Split auth layout: quiet brand panel + focused form. Boxy, premium.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-bg">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden"
        style={{ background: 'radial-gradient(120% 90% at 15% 0%, #12306b 0%, #0b1c3f 55%, #081428 100%)' }}>
        <Link to="/" className="relative z-10 inline-flex"><RazekitLogo mark={34} word={24} className="[&_span]:!text-white" /></Link>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-extrabold text-white leading-[1.1] tracking-tight">Create. Compete. <span className="text-[#4c9bff]">Win.</span></h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">The creator contest marketplace where brands brief real work, creators compete on it, and winners get paid in public.</p>
          <div className="mt-8 flex gap-8">
            {[['Open', 'live contests'], ['Verified', 'creators'], ['Secure', 'payouts']].map(([a, b]) => (
              <div key={b}><p className="font-display text-lg font-bold text-white">{a}</p><p className="text-xs text-white/50">{b}</p></div>
            ))}
          </div>
        </div>
        <div className="absolute -bottom-24 -right-16 w-96 h-96 rounded-full bg-[#1e56c9]/40 blur-3xl" aria-hidden="true" />
      </div>

      {/* Form */}
      <div className="flex flex-col justify-center px-6 sm:px-10 py-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden mb-8"><RazekitLogo mark={32} word={22} /></div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted text-center">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
