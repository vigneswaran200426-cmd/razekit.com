import { motion } from 'framer-motion';
import { Sparkles, ChevronRight, Flame } from 'lucide-react';
import { careerProfile } from './mockData';

export default function HeroSection({ user }) {
  const xpPercent = Math.round((careerProfile.currentXP / careerProfile.nextLevelXP) * 100);
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  const userName = user?.full_name || user?.email?.split('@')[0] || 'Creator';

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-secondary/50 p-5 md:p-7">
      <div className="absolute -top-20 -right-20 w-56 h-56 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="relative flex flex-col md:flex-row md:items-center gap-5">
        <div className="relative shrink-0">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30 flex items-center justify-center">
            <span className="font-heading text-2xl font-bold text-primary">{userName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-lg">
            LV {careerProfile.level}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{greeting},</p>
          <h1 className="font-heading text-xl md:text-2xl font-bold mb-2">{userName}</h1>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
              <Sparkles className="w-3 h-3" /> {careerProfile.rank}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary text-muted-foreground text-xs font-medium">
              <Flame className="w-3 h-3 text-primary" /> {careerProfile.careerScore.toLocaleString('en-IN')} Score
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">XP Progress</span>
              <span className="text-primary font-semibold">{careerProfile.currentXP.toLocaleString()} / {careerProfile.nextLevelXP.toLocaleString()}</span>
            </div>
            <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${xpPercent}%` }} transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 relative">
                <div className="absolute inset-0 shimmer rounded-full" />
              </motion.div>
            </div>
          </div>
        </div>
        <div className="flex md:flex-col items-center justify-center gap-1.5 bg-secondary/50 border border-border rounded-xl p-3 md:min-w-[130px]">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next Unlock</p>
          <p className="font-heading text-sm font-semibold text-center leading-tight">{careerProfile.nextUnlock.label}</p>
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <ChevronRight className="w-3 h-3" /> LV {careerProfile.nextUnlock.unlockLevel}
          </span>
        </div>
      </div>
    </motion.div>
  );
}