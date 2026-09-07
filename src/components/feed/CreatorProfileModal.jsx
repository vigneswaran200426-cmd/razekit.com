import { useState } from 'react';
import { X, BadgeCheck, Trophy, Star, Calendar, Award, Heart, Film, Video, Lock } from 'lucide-react';
import { MOCK_POSTS, formatCount } from './feedData';

const TABS = ['Posts', 'Videos', 'Wins', 'Liked', 'Saved'];

export default function CreatorProfileModal({ creator, onClose }) {
  const [tab, setTab] = useState('Posts');

  if (!creator) return null;

  const userPosts = MOCK_POSTS.filter(p => p.author_username === creator.username);

  const getTabPosts = () => {
    if (tab === 'Posts') return userPosts;
    if (tab === 'Videos') return userPosts.filter(p => p.type === 'video');
    if (tab === 'Wins') return userPosts.filter(p => p.category === 'Contest Winning Videos');
    if (tab === 'Liked') return MOCK_POSTS.filter(p => p.author_username !== creator.username).slice(0, 6);
    if (tab === 'Saved') return MOCK_POSTS.slice(2, 8);
    return userPosts;
  };

  const tabPosts = getTabPosts();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative min-h-screen flex items-start justify-center py-4 md:py-12" onClick={e => e.stopPropagation()}>
        <div className="bg-card border border-border rounded-t-2xl md:rounded-2xl w-full max-w-md overflow-hidden">
          {/* Banner */}
          <div className="relative h-32 bg-secondary">
            {creator.banner && <img src={creator.banner} alt="" className="w-full h-full object-cover" />}
            <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Profile Header */}
          <div className="px-4 pb-4 -mt-12 relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 border-4 border-card flex items-center justify-center mb-3">
              <span className="font-heading text-2xl font-bold text-primary">{creator.name?.[0]}</span>
            </div>

            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="font-heading text-xl font-bold">{creator.name}</p>
              {creator.verified && <BadgeCheck className="w-5 h-5 text-primary" />}
            </div>
            <p className="text-sm text-primary mb-1">@{creator.username}</p>
            <p className="text-sm text-muted-foreground mb-3">{creator.bio}</p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <StatBox label="Level" value={`Lv ${creator.level}`} icon={Trophy} />
              <StatBox label="Career Score" value={creator.score?.toLocaleString('en-IN')} icon={Star} />
              <StatBox label="Wins" value={creator.wins} icon={Award} />
              <StatBox label="Reviews" value={`${creator.reviews}★`} icon={Heart} />
              <StatBox label="Win Streak" value={`🔥 ${creator.winStreak}`} icon={Trophy} />
              <StatBox label="Member Since" value={creator.memberSince} icon={Calendar} />
            </div>

            {/* Profile Tabs */}
            <div className="flex border-t border-border">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${tab === t ? 'text-primary' : 'text-muted-foreground'}`}>
                  {t === 'Saved' && <Lock className="w-3 h-3 inline mr-0.5" />}
                  {t}
                  {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="pt-3">
              {tabPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {tabPosts.map(p => (
                    <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-secondary relative group cursor-pointer">
                      <img src={p.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute bottom-1 left-1 flex items-center gap-1">
                        {p.type === 'video' && <Video className="w-3 h-3 text-white fill-white/30" />}
                        <Heart className="w-3 h-3 text-white fill-white/50" />
                        <span className="text-[10px] text-white font-medium">{formatCount(p.likes_count)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {tab === 'Saved' ? 'Your saved posts are private' : `No ${tab.toLowerCase()} yet`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
      <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-0.5" />
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}