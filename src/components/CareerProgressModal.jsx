import { X, Lock, CheckCircle2, LogIn, Upload, Trophy, Star, UserCheck } from 'lucide-react';
import { careerProfile } from '@/components/home/mockData';
import { LEVEL_TIERS, XP_REWARDS } from '@/lib/contest-utils';

const ICON_MAP = { LogIn, Upload, Trophy, Star, UserCheck };

export default function CareerProgressModal({ open, onClose }) {
  if (!open) return null;

  const xpPercent = Math.round((careerProfile.currentXP / careerProfile.nextLevelXP) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-card border border-border rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-bold">Career Progress</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="bg-primary/10 rounded-xl p-4 mb-5 text-center">
          <p className="text-xs text-muted-foreground">Current Level</p>
          <p className="font-heading text-3xl font-bold text-primary">Level {careerProfile.level}</p>
          <p className="text-sm text-muted-foreground">{careerProfile.rank}</p>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{careerProfile.currentXP} XP</span>
            <span className="text-muted-foreground">{careerProfile.nextLevelXP} XP</span>
          </div>
          <div className="h-2 rounded-full bg-secondary mt-1 overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Level Tiers</p>
          <div className="space-y-2">
            {LEVEL_TIERS.map((tier, idx) => {
              const isUnlocked = careerProfile.level >= tier.level;
              const nextTier = LEVEL_TIERS[idx + 1];
              const isCurrent = isUnlocked && (!nextTier || careerProfile.level < nextTier.level);
              return (
                <div key={tier.level} className={`flex items-center gap-3 rounded-lg p-3 ${isCurrent ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/50'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isUnlocked ? 'bg-primary/10' : 'bg-secondary'}`}>
                    {isUnlocked ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Level {tier.level} · {tier.label}</p>
                    <p className="text-xs text-muted-foreground">₹{tier.minPrize.toLocaleString('en-IN')} - {tier.maxPrize === Infinity ? '∞' : '₹' + tier.maxPrize.toLocaleString('en-IN')}</p>
                  </div>
                  {isCurrent && <span className="text-xs text-primary font-medium">You</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">How to Earn XP</p>
          <div className="space-y-2">
            {XP_REWARDS.map(xp => {
              const Icon = ICON_MAP[xp.icon] || Star;
              return (
                <div key={xp.action} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="w-4 h-4" /> {xp.action}
                  </span>
                  <span className="text-primary font-medium">+{xp.xp} XP</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}