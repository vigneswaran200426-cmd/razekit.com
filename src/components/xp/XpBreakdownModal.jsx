import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getLevelProgress, getRankName } from '@/lib/xpSystem';

export default function XpBreakdownModal({ open, onOpenChange, userId, contestId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!open || !userId || !contestId) return;
    setLoading(true);
    Promise.all([
      base44.entities.XpTransaction.filter({ user_id: userId, contest_id: contestId }, '-created_date', 50).catch(() => []),
      base44.entities.CreatorStats.filter({ user_id: userId }, '-created_date', 1).catch(() => []),
    ]).then(([txns, statsArr]) => {
      setTransactions(txns);
      setStats(statsArr[0] || null);
      setLoading(false);
    });
  }, [open, userId, contestId]);

  const totalXp = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  const progress = stats ? getLevelProgress(stats.total_xp || 0) : null;

  const categoryLabel = (cat) => {
    const labels = {
      join: 'Participation', submit: 'Submission', result: 'Contest Result',
      review: 'Client Review', quality: 'Quality Score', consistency: 'Consistency Bonus',
      delivery: 'Fast Delivery', penalty: 'Penalty',
    };
    return labels[cat] || cat;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> XP Breakdown
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-secondary border-t-primary rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No XP earned for this contest yet.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
            {transactions.map((t) => {
              let breakdown = [];
              try { breakdown = JSON.parse(t.breakdown || '[]'); } catch {}
              return (
                <div key={t.id} className="bg-secondary/40 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {categoryLabel(t.category)}
                    </span>
                    <span className={`text-sm font-bold ${t.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {t.amount >= 0 ? '+' : ''}{t.amount} XP
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5">{t.description}</p>
                  {breakdown.length > 0 && (
                    <div className="space-y-1 pt-1.5 border-t border-border/50">
                      {breakdown.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{b.label}</span>
                          <span className={b.amount >= 0 ? 'text-success font-medium' : 'text-destructive font-medium'}>
                            {b.amount >= 0 ? '+' : ''}{b.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {t.rating > 0 && (
                    <p className="text-xs text-primary mt-1.5">Client rating: {t.rating}{'\u2605'}</p>
                  )}
                </div>
              );
            })}

            {/* Total */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="font-heading font-bold">Total XP Earned</span>
              <span className={`font-heading font-bold text-lg ${totalXp >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {totalXp >= 0 ? '+' : ''}{totalXp} XP
              </span>
            </div>

            {/* Level Progress */}
            {progress && (
              <div className="bg-primary/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">Level {progress.level} · {getRankName(progress.level)}</span>
                  <span className="text-xs text-muted-foreground">{(stats.total_xp || 0).toLocaleString()} XP</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress.progressPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {progress.isMaxLevel
                    ? 'Max level reached!'
                    : `${progress.xpIntoLevel.toLocaleString()} / ${progress.xpForNextLevel.toLocaleString()} XP to Level ${progress.level + 1}`}
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}