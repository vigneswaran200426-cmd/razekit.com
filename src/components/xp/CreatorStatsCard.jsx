import { Zap, Trophy, Star, Clock, CheckCircle, TrendingUp, Shield, Globe, Gem } from 'lucide-react';
import { getLevelProgress, getRankName } from '@/lib/xpSystem';

export default function CreatorStatsCard({ stats }) {
  if (!stats) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 text-center text-sm text-muted-foreground">
        Loading stats...
      </div>
    );
  }

  const progress = getLevelProgress(stats.total_xp || 0);
  const avgRating = stats.total_reviews > 0 ? (stats.review_score_sum / stats.total_reviews).toFixed(1) : null;
  const winRate = stats.contests_joined > 0 ? Math.round((stats.contests_won / stats.contests_joined) * 100) : 0;
  const submitted = (stats.on_time_count || 0) + (stats.late_count || 0);
  const onTimeRate = submitted > 0 ? Math.round((stats.on_time_count / submitted) * 100) : 100;
  const completionRate = stats.contests_joined > 0 ? Math.round((stats.contests_submitted / stats.contests_joined) * 100) : 100;
  const rep = stats.reputation_score || 0;
  const repColor = rep >= 75 ? 'text-success' : rep >= 50 ? 'text-primary' : rep >= 25 ? 'text-amber-500' : 'text-destructive';
  const repBg = rep >= 75 ? 'bg-success/10' : rep >= 50 ? 'bg-primary/10' : rep >= 25 ? 'bg-amber-500/10' : 'bg-destructive/10';
  const repLabel = rep >= 75 ? 'Excellent' : rep >= 50 ? 'Good' : rep >= 25 ? 'Fair' : 'Poor';

  const statTiles = [
    { label: 'Win Rate', value: `${winRate}%`, sub: `${stats.contests_won || 0}/${stats.contests_joined || 0} won`, icon: Trophy, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Avg Rating', value: avgRating ? `${avgRating}\u2605` : '\u2014', sub: `${stats.total_reviews || 0} reviews`, icon: Star, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'On-Time', value: `${onTimeRate}%`, sub: `${stats.on_time_count || 0} on time`, icon: Clock, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Completion', value: `${completionRate}%`, sub: `${stats.contests_submitted || 0}/${stats.contests_joined || 0} done`, icon: CheckCircle, color: 'text-foreground', bg: 'bg-secondary' },
    { label: 'Global Rank', value: stats.global_rank ? `#${stats.global_rank}` : '\u2014', sub: `Level ${progress.level} · ${getRankName(progress.level)}`, icon: Globe, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Quality', value: stats.quality_score_count > 0 ? `${Math.round((stats.quality_score_sum || 0) / stats.quality_score_count)}` : '\u2014', sub: `${stats.quality_score_count || 0} scored`, icon: Gem, color: 'text-accent', bg: 'bg-accent/10' },
  ];

  return (
    <div className="space-y-3">
      {/* Level + XP Progress */}
      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-heading font-bold text-lg">Level {progress.level}</p>
              <p className="text-xs text-muted-foreground">{getRankName(progress.level)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-heading font-bold text-lg">{(stats.total_xp || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total XP</p>
          </div>
        </div>
        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress.progressPct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {progress.isMaxLevel
            ? 'Max level reached!'
            : `${progress.xpIntoLevel.toLocaleString()} / ${progress.xpForNextLevel.toLocaleString()} XP to Level ${progress.level + 1}`}
        </p>
      </div>

      {/* Reputation Score */}
      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${repBg} flex items-center justify-center`}>
              <Shield className={`w-6 h-6 ${repColor}`} />
            </div>
            <div>
              <p className="font-heading font-bold text-lg">
                {rep}<span className="text-sm text-muted-foreground">/100</span>
              </p>
              <p className="text-xs text-muted-foreground">Reputation · {repLabel}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">Rating 40%</span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">Win Rate 20%</span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">On-Time 15%</span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">Compliance 15%</span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">Trust 10%</span>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {statTiles.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-4 card-shadow">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-xl font-heading font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Streak */}
      {(stats.best_streak > 0 || stats.current_streak > 0) && (
        <div className="bg-card border border-border rounded-2xl p-4 card-shadow flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Quality Streak: {stats.current_streak || 0}</p>
            <p className="text-xs text-muted-foreground">Best: {stats.best_streak || 0} in a row</p>
          </div>
        </div>
      )}
    </div>
  );
}