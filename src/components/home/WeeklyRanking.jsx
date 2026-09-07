import { Globe, MapPin, Trophy, ChevronRight } from 'lucide-react';
import { weeklyRanking } from './mockData';

export default function WeeklyRanking() {
  const stats = [
    { icon: Trophy, value: `Top ${weeklyRanking.percentile}%`, label: 'Percentile' },
    { icon: MapPin, value: `#${weeklyRanking.countryRank}`, label: 'Country Rank' },
    { icon: Globe, value: `#${weeklyRanking.globalRank}`, label: 'Global Rank' },
  ];

  return (
    <div>
      <h2 className="font-heading text-lg font-semibold mb-3">Weekly Ranking</h2>
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="grid grid-cols-3 gap-4 mb-4">
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
        <button className="w-full flex items-center justify-center gap-2 text-sm font-medium text-primary border border-primary/30 rounded-lg py-2.5 hover:bg-primary/5 transition-colors">
          View Leaderboard <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}