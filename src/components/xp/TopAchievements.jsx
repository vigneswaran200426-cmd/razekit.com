import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { BADGE_DEFINITIONS, getUserBadges } from '@/lib/xpSystem';
import { BADGE_VISUALS, RARITY } from '@/lib/xp/badge-visuals';
import Emblem from './Emblem';

// Compact "Top Achievements" for the profile — best 3-5 earned emblems + a
// "View all badges" link. Does NOT show the full grid on the profile.
export default function TopAchievements({ userId }) {
  const [earned, setEarned] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    getUserBadges(userId).then((awards) => {
      const defs = awards
        .map((a) => BADGE_DEFINITIONS.find((b) => b.id === a.badge_id))
        .filter(Boolean)
        .sort((a, b) => (RARITY[BADGE_VISUALS[b.id]?.rarity]?.rank || 0) - (RARITY[BADGE_VISUALS[a.id]?.rarity]?.rank || 0))
        .slice(0, 5);
      setEarned(defs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  if (loading) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 card-shadow">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Top Achievements</h2>
        <Link to="/badges" className="text-xs text-primary hover:underline">View all badges</Link>
      </div>
      {earned.length === 0 ? (
        <div className="flex flex-col items-center text-center py-4">
          <Award className="w-6 h-6 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No badges yet — start winning contests to earn achievements.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {earned.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-1 w-16">
              <Emblem badge={b} earned className="w-12 h-12 sm:w-14 sm:h-14" />
              <p className="text-[10px] font-medium leading-tight text-center">{b.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}