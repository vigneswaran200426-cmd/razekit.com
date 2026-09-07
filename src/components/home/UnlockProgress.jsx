import { motion } from 'framer-motion';
import { Lock, Check } from 'lucide-react';
import { unlocks, careerProfile } from './mockData';

export default function UnlockProgress() {
  const nextUnlock = unlocks.filter(u => !u.unlocked).sort((a, b) => a.level - b.level)[0];

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Unlocks</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {unlocks.map((u, i) => {
          const isNext = u.level === nextUnlock?.level;
          return (
            <motion.div key={u.level} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
              className={`relative rounded-xl border p-4 text-center ${u.unlocked ? 'border-success/30 bg-success/5' : isNext ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
              <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center ${u.unlocked ? 'bg-success/10' : 'bg-secondary'}`}>
                {u.unlocked ? <Check className="w-5 h-5 text-success" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
              </div>
              <p className="text-[10px] text-muted-foreground mb-0.5">Level {u.level}</p>
              <p className="font-semibold text-sm mb-1">{u.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{u.sub}</p>
              {isNext && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full whitespace-nowrap">NEXT</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}