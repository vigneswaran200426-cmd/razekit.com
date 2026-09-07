// Shared wrapper for all auth screens — Login, Register, ForgotPassword, ResetPassword.
// Razekit premium light-blue layout: floating brand orbs for depth, brand icon tile, glass card.
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { RazekitWordmark, RazekitIcon } from '@/components/brand/RazekitLogo';

export default function AuthLayout({ children, title, subtitle, footer, icon: Icon }) {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
      style={{
        background:
          'radial-gradient(1000px 560px at 82% -10%, hsl(200 100% 84% / 0.42) 0%, transparent 58%),' +
          'radial-gradient(880px 620px at 8% 6%, hsl(217 92% 62% / 0.10) 0%, transparent 52%),' +
          'linear-gradient(180deg, #F7FBFF 0%, #EEF6FF 100%)',
      }}
    >
      {/* Decorative floating brand orbs — soft depth, reduced-motion safe */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="rz-anim-float absolute -top-16 right-[14%] w-56 h-56 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(82,180,255,0.30), transparent 70%)', '--rz-dur': '13s' }} />
        <div className="rz-anim-drift absolute bottom-[6%] left-[10%] w-64 h-64 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(26,123,248,0.16), transparent 70%)', '--rz-dur': '16s' }} />
      </div>

      {/* Logo header */}
      <div className="relative flex flex-col items-center mb-7">
        <Link to="/" className="flex items-center gap-3 mb-1 press" aria-label="Razekit home">
          <RazekitIcon size={38} />
          <RazekitWordmark height={26} />
        </Link>
        {Icon && (
          <div className="mt-5 w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <Icon className="w-5 h-5" />
          </div>
        )}
        {title && <h1 className="font-heading text-xl font-bold text-foreground mt-3 tracking-tight">{title}</h1>}
        {subtitle && <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">{subtitle}</p>}
      </div>

      {/* Glass card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md glass-card rounded-3xl p-6 shadow-glass-lg"
      >
        {children}
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-5">{footer}</p>
        )}
      </motion.div>

      <p className="relative text-[11px] text-muted-foreground mt-8">
        © {new Date().getFullYear()} Razekit · Prize-funded contest marketplace
      </p>
    </div>
  );
}