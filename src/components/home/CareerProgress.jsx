import { motion } from 'framer-motion';
import { TrendingUp, Award, ChevronRight } from 'lucide-react';
import { careerProfile } from './mockData';

export default function CareerProgress() {
  const xpPercent = Math.round((careerProfile.currentXP / careerProfile.nextLevelXP) * 100);
  const stats = [
    { label: 'Career Score', value: careerProfile.careerScore.toLocaleString('en-IN'), icon: TrendingUp },
    { label: 'Level', value: careerProfile.level, icon: Award },
    { label: 'Rank', value: careerProfile.rank, icon: ChevronRight },
  ];

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Career Progress</h2>
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="grid grid-cols-3 gap-4 mb-5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="text-center">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="font-heading text-base md:text-lg font-bold">{s.value}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">Level {careerProfile.level} → Level {careerProfile.level + 1}</span>
          <span className="text-primary font-semibold">{careerProfile.currentXP} / {careerProfile.nextLevelXP} XP</span>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${xpPercent}%` }} transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 relative">
            <div className="absolute inset-0 shimmer rounded-full" />
          </motion.div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {careerProfile.nextLevelXP - careerProfile.currentXP} XP until <span className="text-primary font-medium">{careerProfile.nextUnlock.label}</span>
        </p>
      </div>
    </div>
  );
}