import { motion } from 'framer-motion';
import { Crown, TrendingUp, Zap, Star, FileCheck, Palette, Lock } from 'lucide-react';
import { achievements } from './mockData';

const iconMap = { Crown, TrendingUp, Zap, Star, FileCheck, Palette };

export default function Achievements() {
  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Achievements</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {achievements.map((a, i) => {
          const Icon = iconMap[a.icon] || Crown;
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`relative rounded-xl border p-4 ${a.unlocked ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-transparent' : 'border-border bg-card opacity-70'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${a.unlocked ? 'bg-primary/10' : 'bg-secondary'}`}>
                  {a.unlocked ? <Icon className="w-5 h-5 text-primary" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{a.desc}</p>
                </div>
              </div>
              {a.unlocked ? (
                <p className="text-[10px] text-success mt-2 font-medium">Unlocked · {a.date}</p>
              ) : (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-primary/40" style={{ width: `${(a.progress / a.total) * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{a.progress} / {a.total}</p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}