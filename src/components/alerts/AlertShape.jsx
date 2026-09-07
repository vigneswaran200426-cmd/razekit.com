import { cn } from '@/lib/utils';

/*
  Razekit AlertShape — the animated visual mark inside every alert/empty/error state.
  Soft translucent material: a background halo, one primary shape, a tiny accent.
  Motion is pure CSS transforms/opacity (GPU-friendly) and disabled under
  prefers-reduced-motion. Never animates text or the card itself.
*/

const PRESETS = {
  emptyBlue:      { bg: 'rgba(82,180,255,0.14)', base: '#DCEBFF', hint: '#A9D2FF', accent: '#287FFF' },
  emptyLavender:  { bg: 'rgba(199,185,255,0.14)', base: '#EAE5FF', hint: '#CFC2FF', accent: '#8B7BF7' },
  infoBlue:       { bg: 'rgba(40,127,255,0.12)', base: '#D8E7FF', hint: '#AECBFF', accent: '#1457D9' },
  processingBlue: { bg: 'rgba(82,180,255,0.16)', base: '#D8E7FF', hint: '#9CC5FF', accent: '#287FFF' },
  successGreen:   { bg: 'rgba(82,184,136,0.13)', base: '#DDF3E8', hint: '#B0E2C9', accent: '#1F9D66' },
  warningAmber:   { bg: 'rgba(232,163,61,0.13)', base: '#FFF1DB', hint: '#FAD9A6', accent: '#DD9231' },
  errorCoral:     { bg: 'rgba(222,107,84,0.10)', base: '#FDEAE7', hint: '#F8C8BF', accent: '#DE6B54' },
  neutralGray:    { bg: 'rgba(143,163,189,0.12)', base: '#EDF1F7', hint: '#D7DEE9', accent: '#8FA3BD' },
};

const SHAPES = {
  blob:    { w: 0.74, h: 0.74, radius: '46% 54% 52% 48% / 48% 44% 56% 52%' },
  circle:  { w: 0.72, h: 0.72, radius: '9999px' },
  square:  { w: 0.68, h: 0.68, radius: '26%' },
  diamond: { w: 0.60, h: 0.60, radius: '22%', rotate: 45 },
  pill:    { w: 0.95, h: 0.46, radius: '9999px' },
  ring:    { w: 0.78, h: 0.78, radius: '9999px', ring: true },
  orbs:    { w: 0.30, h: 0.30, radius: '9999px', orbs: true },
};

export default function AlertShape({
  preset = 'emptyBlue',
  shape = 'blob',
  motion = 'float',
  size = 72,
  duration,
  delay = 0,
  animated = true,
  className,
}) {
  const p = PRESETS[preset] || PRESETS.emptyBlue;
  const s = SHAPES[shape] || SHAPES.blob;
  // Organic variety: each motion family gets its own default cadence.
  const defaultDur = { float: 9, breathe: 7, drift: 11, orbit: 12, oscillate: 6, rise: 8, rotate: 14, pulse: 4 }[motion] || 9;
  const dur = duration || defaultDur;
  const anim = (d, extraDelay = 0) => (animated ? { className: `rz-anim-${motion}`, style: { '--rz-dur': `${d}s`, '--rz-delay': `${delay + extraDelay}s` } } : {});

  const surface = (w, h, radius) => ({
    width: size * w,
    height: size * h,
    borderRadius: radius,
    background: `linear-gradient(145deg, ${p.base}, ${p.hint})`,
    boxShadow: '0 8px 20px -8px rgba(12,36,68,0.14), inset 0 1px 2px rgba(255,255,255,0.55)',
  });

  return (
    <div className={cn('relative shrink-0 mx-auto', className)} style={{ width: size, height: size }} aria-hidden="true">
      {/* soft halo — floats on its own slower cadence */}
      <div
        className={cn('absolute rounded-full blur-[2px]', anim(dur * 1.35, 0.8).className)}
        style={{ inset: -size * 0.16, background: p.bg, ...(anim(dur * 1.35, 0.8).style || {}) }}
      />

      {/* primary shape — animation wrapper outside so shape rotation survives */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={cn('flex items-center justify-center', anim(dur).className)} style={anim(dur).style || {}}>
          {s.orbs ? (
            <div className="relative" style={{ width: size * 0.9, height: size * 0.9 }}>
              <div className="absolute left-0 top-1/2 -translate-y-1/2" style={surface(0.30, 0.30, '9999px')} />
              <div className="absolute left-1/2 top-0 -translate-x-1/2" style={surface(0.36, 0.36, '9999px')} />
              <div className="absolute right-0 bottom-0" style={surface(0.44, 0.44, '9999px')} />
            </div>
          ) : (
            <div
              className={cn('relative flex items-center justify-center', s.rotate ? 'rotate-45' : '')}
              style={{
                ...surface(s.w, s.h, s.radius),
                ...(s.ring ? { background: `${p.base}66`, border: `${Math.max(3, size * 0.075)}px solid ${p.hint}` } : {}),
              }}
            >
              {s.rotate ? <div className="-rotate-45 w-full h-full" /> : null}
              {/* ceramic highlight */}
              {!s.ring && <span className="absolute left-[16%] top-[12%] w-[32%] h-[20%] rounded-full bg-white/55 blur-[3px] -rotate-12" />}
            </div>
          )}
        </div>
      </div>

      {/* tiny accent — counter-cadence drift for depth */}
      <span
        className={cn('absolute rounded-full', animated ? 'rz-anim-rise' : '')}
        style={{
          top: size * 0.02,
          right: size * 0.03,
          width: size * 0.13,
          height: size * 0.13,
          background: p.accent,
          opacity: 0.45,
          ...(animated ? { '--rz-dur': `${dur * 1.6}s`, '--rz-delay': `${delay + 1.4}s` } : {}),
        }}
      />
    </div>
  );
}