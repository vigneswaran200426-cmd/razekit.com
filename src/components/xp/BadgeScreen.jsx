import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, X, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { BADGE_DEFINITIONS, getUserBadges, getOrCreateCreatorStats } from '@/lib/xpSystem';
import { BADGE_GROUPS, BADGE_VISUALS, RARITY, getProgress } from '@/lib/xp/badge-visuals';
import { getUserProfile } from '@/lib/username-utils';
import { useToast } from '@/components/ui/use-toast';
import Emblem from './Emblem';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function BadgeScreen({ userId }) {
  const [stats, setStats] = useState(null);
  const [earnedIds, setEarnedIds] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [setting, setSetting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [s, awards, prof] = await Promise.all([
        getOrCreateCreatorStats(userId).catch(() => null),
        getUserBadges(userId).catch(() => []),
        getUserProfile(userId).catch(() => null),
      ]);
      setStats(s);
      setEarnedIds(awards.map((a) => a.badge_id));
      setFeatured(prof?.featured_badge_id || null);
      setProfileId(prof?.id || null);
      setLoading(false);
    })();
  }, [userId]);

  const setAsFeatured = async (badgeId) => {
    if (!profileId) return;
    setSetting(true);
    try {
      await base44.entities.UserProfile.update(profileId, { featured_badge_id: badgeId });
      setFeatured(badgeId);
      toast({ title: 'Featured achievement updated' });
    } catch (e) {
      toast({ title: 'Could not update', description: e.message, variant: 'destructive' });
    } finally { setSetting(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  const unlockedCount = earnedIds.length;
  const totalCount = BADGE_DEFINITIONS.length;

  const selRarity = selected ? (BADGE_VISUALS[selected.id]?.rarity || 'common') : 'common';
  const selRarityMeta = RARITY[selRarity];
  const selEarned = selected ? earnedIds.includes(selected.id) : false;
  const selProg = selected && !selEarned ? getProgress(selected.id, stats) : null;

  return (
    <div className="p-4 md:p-6 max-w-3xl lg:max-w-4xl mx-auto pb-8">
      <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Profile
      </Link>

      <div className="flex items-end justify-between mb-1">
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Badges</h1>
        <span className="text-sm text-muted-foreground">{unlockedCount} / {totalCount} unlocked</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-6">
        <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${(unlockedCount / totalCount) * 100}%` }} />
      </div>

      <div className="space-y-6">
        {BADGE_GROUPS.map((group) => {
          if (group.showIf && !group.showIf(stats)) return null;
          const badges = group.badgeIds.map((id) => BADGE_DEFINITIONS.find((b) => b.id === id)).filter(Boolean);
          if (badges.length === 0) return null;
          return (
            <div key={group.id}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{group.label}</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {badges.map((badge) => {
                  const isEarned = earnedIds.includes(badge.id);
                  const prog = !isEarned ? getProgress(badge.id, stats) : null;
                  return (
                    <button key={badge.id} onClick={() => setSelected(badge)} className="flex flex-col items-center gap-1.5 group">
                      <div className="transition-transform group-hover:scale-105 group-active:scale-95">
                        <Emblem badge={badge} earned={isEarned} lock={!isEarned} className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24" />
                      </div>
                      <p className={`text-[10px] font-medium leading-tight text-center ${isEarned ? 'text-foreground' : 'text-muted-foreground'}`}>{badge.name}</p>
                      {!isEarned && prog && <p className="text-[9px] text-muted-foreground">{prog.current}/{prog.target}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setSelected(null)}>
          <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl border border-border p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${selRarityMeta.text}`}>{selRarityMeta.label}</span>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col items-center text-center">
              <Emblem badge={selected} earned={selEarned} lock={!selEarned} className="w-28 h-28 mb-3" />
              <p className="font-heading text-lg font-bold">{selected.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
            </div>

            {!selEarned ? (
              <div className="mt-4">
                {selProg ? (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1"><span>Progress</span><span>{selProg.current} / {selProg.target}</span></div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (selProg.current / selProg.target) * 100)}%` }} /></div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">Keep creating to unlock this achievement.</p>
                )}
              </div>
            ) : (
              <div className="mt-4">
                {featured === selected.id ? (
                  <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary"><Star className="w-4 h-4 fill-primary" /> Featured achievement</div>
                ) : (
                  <button onClick={() => setAsFeatured(selected.id)} disabled={setting} className="w-full h-10 rounded-xl border border-border text-sm font-medium hover:bg-secondary">
                    Set as Featured
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}