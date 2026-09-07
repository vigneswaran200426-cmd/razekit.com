import { useState } from 'react';
import { Trophy, Clock, Crown, Star, MapPin, Globe, Medal, BadgeCheck } from 'lucide-react';
import { careerProfile, weeklyRanking } from '@/components/home/mockData';
import { MOCK_CREATORS } from './feedData';

const SEASON = { name: 'Season 3', endsIn: '12d 6h 30m' };
const TABS = ['Weekly', 'Monthly', 'All Time'];
const FILTERS = ['Global', 'Country', 'State'];
const SCORE_MULTIPLIER = [0.15, 0.4, 1.0];
const MY_RANKS = { Global: weeklyRanking.globalRank, Country: weeklyRanking.countryRank, State: 12 };
const FILTER_ICONS = [Globe, MapPin, MapPin];

export default function RankingsTab({ onProfile }) {
  const [tab, setTab] = useState(2);
  const [filter, setFilter] = useState(0);

  const multiplier = SCORE_MULTIPLIER[tab];
  const creators = MOCK_CREATORS.map((c, i) => ({ ...c, rank: i + 1, displayScore: Math.round(c.score * multiplier) }));
  const top3 = creators.slice(0, 3);
  const rest = creators.slice(3);
  const myRank = MY_RANKS[FILTERS[filter]];
  const xpNeeded = careerProfile.nextLevelXP - careerProfile.currentXP;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/10 to-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground">Current Season</p>
            <p className="font-heading text-lg font-bold">{SEASON.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Time Remaining</p>
            <p className="font-heading text-sm font-bold text-primary flex items-center gap-1 justify-end"><Clock className="w-3.5 h-3.5" />{SEASON.endsIn}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Your Rank</p>
            <p className="font-heading text-xl font-bold">#{myRank}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Level</p>
            <p className="font-heading text-xl font-bold text-primary">{careerProfile.level}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Career Score</p>
            <p className="font-heading text-xl font-bold">{careerProfile.careerScore.toLocaleString('en-IN')}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Weekly Progress</span>
            <span className="text-primary font-medium">+340 XP this week</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: '68%' }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === i ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 justify-center">
        {FILTERS.map((f, i) => {
          const Icon = FILTER_ICONS[i];
          return (
            <button key={f} onClick={() => setFilter(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filter === i ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
              <Icon className="w-3.5 h-3.5" /> {f}
            </button>
          );
        })}
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-2 sm:gap-4 py-2">
        <PodiumCard creator={top3[1]} medal="🥈" height="h-20" onProfile={onProfile} />
        <PodiumCard creator={top3[0]} medal="🥇" height="h-28" onProfile={onProfile} />
        <PodiumCard creator={top3[2]} medal="🥉" height="h-16" onProfile={onProfile} />
      </div>

      {/* Rank List */}
      <div className="space-y-2">
        {rest.map(c => (
          <button key={c.rank} onClick={() => onProfile?.(c)}
            className="w-full flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2.5 hover:border-primary/40 transition-colors text-left">
            <span className="font-heading font-bold text-sm text-muted-foreground w-6 text-center shrink-0">{c.rank}</span>
            <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="font-heading text-sm font-bold text-primary">{c.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium truncate">{c.name}</p>
                {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="text-primary">@{c.username}</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary">Lv {c.level}</span>
                <span className="flex items-center gap-0.5"><Trophy className="w-3 h-3" />{c.wins}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-semibold text-primary block">{c.displayScore.toLocaleString('en-IN')}</span>
              <span className="text-[10px] text-muted-foreground">⭐ {c.avgRating} · 🔥{c.winStreak}</span>
            </div>
          </button>
        ))}
      </div>

      {/* My Position Pin */}
      <div className="sticky bottom-20 md:bottom-4 z-40">
        <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 flex items-center gap-3 backdrop-blur-sm">
          <span className="font-heading font-bold text-primary">#{myRank}</span>
          <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="font-heading text-xs font-bold text-primary">You</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">You</p>
            <p className="text-[11px] text-muted-foreground">{xpNeeded} XP to Level {careerProfile.level + 1}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-primary">{careerProfile.careerScore.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-muted-foreground">Lv {careerProfile.level}</p>
          </div>
        </div>
      </div>

      {/* Seasonal Rewards */}
      <div>
        <h2 className="font-heading text-lg font-semibold mb-3">Seasonal Rewards</h2>
        <div className="space-y-2">
          {[
            { rank: 'Top 10', reward: 'Verified Creator Badge', icon: BadgeCheck },
            { rank: 'Top 100', reward: 'Premium Contest Access', icon: Crown },
            { rank: 'Top 500', reward: 'Special Profile Badge', icon: Medal },
          ].map(r => {
            const Icon = r.icon;
            return (
              <div key={r.rank} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.rank}</p>
                  <p className="text-xs text-muted-foreground">{r.reward}</p>
                </div>
                <Star className="w-4 h-4 text-muted-foreground/30" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PodiumCard({ creator, medal, height, onProfile }) {
  if (!creator) return null;
  return (
    <button onClick={() => onProfile?.(creator)} className="flex flex-col items-center w-1/3 max-w-[100px]">
      <div className="text-2xl mb-1">{medal}</div>
      <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-1">
        <span className="font-heading font-bold text-primary">{creator.name[0]}</span>
      </div>
      <p className="text-xs font-medium truncate max-w-full">{creator.name}</p>
      <p className="text-[11px] text-primary">@{creator.username}</p>
      <p className="text-[11px] text-muted-foreground">Lv {creator.level}</p>
      <p className="text-xs font-semibold text-primary">{creator.displayScore?.toLocaleString('en-IN')}</p>
      <p className="text-[10px] text-muted-foreground">{creator.wins} wins</p>
      <div className={`w-full ${height} bg-gradient-to-t from-primary/20 to-primary/5 rounded-t-lg mt-2 border border-primary/20`} />
    </button>
  );
}