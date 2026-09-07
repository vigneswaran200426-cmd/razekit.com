import { Lock, Award, Crown, Trophy, Palette, FileCheck, Film, Upload, Star, TrendingUp, BadgeCheck, Sparkles, Zap, Clock, Shield, Flame, Gem, CheckCircle } from 'lucide-react';
import { RARITY, BADGE_VISUALS } from '@/lib/xp/badge-visuals';

const ICON_MAP = { Crown, Trophy, Palette, FileCheck, Film, Upload, Star, TrendingUp, BadgeCheck, Sparkles, Award, Zap, Clock, Shield, Flame, Gem, CheckCircle };

const SHAPES = {
  shield: 'M50 6 L86 20 V46 C86 70 70 86 50 94 C30 86 14 70 14 46 V20 Z',
  crest: 'M18 10 H82 V44 C82 64 68 82 50 92 C32 82 18 64 18 44 Z',
  star: 'M50 6 L61 37 L94 37 L67 57 L78 88 L50 69 L22 88 L33 57 L6 37 L39 37 Z',
  crown: 'M14 78 L22 28 L38 52 L50 20 L62 52 L78 28 L86 78 Z',
  flame: 'M50 6 C64 24 74 34 74 54 C74 74 63 88 50 88 C37 88 26 74 26 56 C26 40 36 36 38 26 C44 34 47 42 50 48 C49 32 47 18 50 6 Z',
  lightning: 'M58 6 L22 54 L44 54 L38 94 L78 40 L54 40 Z',
  diamond: 'M50 8 L88 50 L50 92 L12 50 Z',
  trophy: 'M28 12 H72 V36 C72 54 62 62 50 62 C38 62 28 54 28 36 Z M44 62 H56 V74 H44 Z M32 74 H68 V84 H32 Z',
  banner: 'M12 16 H88 V68 L70 60 L50 68 L30 60 L12 68 Z',
  gem: 'M50 8 L82 38 L50 92 L18 38 Z',
};

function Shape({ shape, fill, stroke }) {
  if (shape === 'medal') {
    return (
      <g>
        <path d="M34 10 L46 10 L40 40 L34 32 Z" fill={fill} opacity="0.85" />
        <path d="M66 10 L54 10 L60 40 L66 32 Z" fill={fill} opacity="0.85" />
        <circle cx="50" cy="58" r="30" fill={fill} stroke={stroke} strokeWidth="2" />
      </g>
    );
  }
  if (shape === 'target') {
    return (
      <g>
        <circle cx="50" cy="50" r="42" fill="none" stroke={stroke} strokeWidth="8" />
        <circle cx="50" cy="50" r="28" fill="none" stroke={stroke} strokeWidth="7" />
        <circle cx="50" cy="50" r="14" fill={fill} />
      </g>
    );
  }
  if (shape === 'gem') {
    return (
      <g>
        <path d={SHAPES.gem} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M30 38 L50 8 L70 38" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
        <path d="M30 38 H70" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />
      </g>
    );
  }
  return <path d={SHAPES[shape] || SHAPES.shield} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />;
}

export default function Emblem({ badge, earned = true, lock = false, className = '' }) {
  const vis = BADGE_VISUALS[badge.id] || { rarity: 'common', shape: 'shield' };
  const rarity = RARITY[vis.rarity] || RARITY.common;
  const gid = `emblem-${badge.id}`;
  const Icon = ICON_MAP[badge.icon] || Award;
  const dim = !earned;

  return (
    <div className={`relative inline-block ${className} ${dim ? 'opacity-50 grayscale' : ''}`}>
      {earned && rarity.glow && (
        <div className="absolute inset-1 rounded-full blur-md opacity-30" style={{ background: `radial-gradient(circle, ${rarity.from}, transparent 70%)` }} />
      )}
      <svg viewBox="0 0 100 100" className="relative w-full h-full block">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rarity.from} />
            {rarity.via && <stop offset="55%" stopColor={rarity.via} />}
            <stop offset="100%" stopColor={rarity.to} />
          </linearGradient>
        </defs>
        <Shape shape={vis.shape} fill={`url(#${gid})`} stroke={vis.shape === 'target' ? rarity.from : 'rgba(255,255,255,0.5)'} />
        <ellipse cx="42" cy="30" rx="14" ry="7" fill="#ffffff" opacity="0.18" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <Icon className="text-white drop-shadow-sm" style={{ width: '36%', height: '36%' }} strokeWidth={2.2} />
      </div>
      {dim && lock && (
        <div className="absolute -bottom-0.5 -right-0.5 w-[30%] h-[30%] rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
          <Lock className="text-muted-foreground" style={{ width: '60%', height: '60%' }} />
        </div>
      )}
    </div>
  );
}