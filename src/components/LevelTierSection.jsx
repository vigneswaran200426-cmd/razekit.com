import ContestRow from '@/components/ContestRow';
import { Lock, CheckCircle2, Star } from 'lucide-react';

export default function LevelTierSection({ level, contests, userLevel, loading }) {
  const isLocked = level > 0 && userLevel < level;
  const isRecommended = level === 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {isRecommended ? (
          <>
            <Star className="w-4 h-4 text-primary" />
            <h2 className="font-heading text-base font-semibold">Recommended</h2>
            <span className="text-xs text-muted-foreground">Available for you</span>
          </>
        ) : (
          <>
            <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isLocked ? 'bg-secondary' : 'bg-primary/10'}`}>
              {isLocked ? <Lock className="w-3 h-3 text-muted-foreground" /> : <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
            </div>
            <h2 className="font-heading text-base font-semibold">Level {level}</h2>
            <span className="text-xs text-muted-foreground">{contests.length} contest{contests.length !== 1 ? 's' : ''}</span>
            {isLocked && <span className="text-xs text-muted-foreground ml-auto">Unlock at Lv {level}</span>}
          </>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : contests.length > 0 ? (
        <div className="space-y-2">
          {contests.map(c => <ContestRow key={c.id} contest={c} />)}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2">No contests</p>
      )}
    </div>
  );
}