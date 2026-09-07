import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Settings as SettingsIcon, Briefcase, BadgeCheck, Star, Trophy, ShieldCheck, Image as ImageIcon, Activity, ExternalLink, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile } from '@/lib/username-utils';
import RoleBadge from '@/components/RoleBadge';
import ClientReviews from '@/components/reviews/ClientReviews';
import AlertState from '@/components/alerts/AlertState';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [contests, setContests] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.auth.me().catch(() => null),
      base44.entities.Contest.list('-created_date', 100).catch(() => []),
    ]).then(async ([userData, contestData]) => {
      setUser(userData);
      setContests(contestData);
      if (userData?.id) {
        const p = await getUserProfile(userData.id);
        setProfile(p);
        const rv = await base44.entities.Review.filter({ creator_id: userData.id, status: 'published' }, '-created_date', 100).catch(() => []);
        setReviews(rv.filter((r) => (r.reviewer_role || 'client') === 'client'));
        const ps = await base44.entities.Post.filter({ author_id: userData.id, status: 'published' }, '-created_date', 6).catch(() => []);
        setPosts(ps);
      }
    });
  }, []);

  const isClient = user?.user_role === 'client';
  const userName = user?.full_name || user?.email?.split('@')[0] || 'Creator';
  const professionalTitle = isClient ? (profile?.company_name || 'Brand') : (profile?.professional_title || 'Video Editor');

  const myContests = contests.filter(c => c.created_by_id === user?.id);
  const completedContests = myContests.filter(c => ['winner_selected', 'completed'].includes(c.status));
  const activeContests = myContests.filter(c => ['open', 'joined', 'working', 'submitted', 'reviewing'].includes(c.status));

  // Verified reputation — real outcomes only: review score, review count, wins.
  const wins = contests.filter(c => c.winner_user_id === user?.id && ['winner_selected', 'completed'].includes(c.status)).length;
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / reviews.length).toFixed(1)
    : null;
  const editorStats = [
    { label: 'Rating', value: avgRating || '—', icon: Star },
    { label: 'Reviews', value: reviews.length, icon: ShieldCheck },
    { label: 'Wins', value: wins, icon: Trophy },
    { label: 'Projects', value: completedContests.length, icon: Briefcase },
  ];
  const clientStatsList = [
    { label: 'Projects', value: myContests.length, icon: Briefcase },
    { label: 'Active', value: activeContests.length, icon: Activity },
    { label: 'Completed', value: completedContests.length, icon: Trophy },
  ];
  const stats = isClient ? clientStatsList : editorStats;
  const skills = profile?.skills ? profile.skills.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="p-4 md:p-6 max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="glass-card rounded-3xl p-6 elev-2 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : isClient ? <Briefcase className="w-7 h-7 text-primary" /> : <span className="font-heading text-2xl font-bold text-primary">{userName.charAt(0).toUpperCase()}</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-heading font-bold text-lg truncate">{userName}</p>
            </div>
            {profile?.username && <p className="text-xs text-primary">@{profile.username}</p>}
            <p className="text-xs text-muted-foreground truncate">{professionalTitle}</p>
            <div className="mt-1.5"><RoleBadge role={user?.user_role || 'editor'} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <Link to="/edit-profile" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-full py-2.5 text-sm font-semibold hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px active:scale-[0.98] transition-all duration-200 press">
            <Pencil className="w-4 h-4" /> Edit profile
          </Link>
          <Link to="/settings" className="flex items-center justify-center gap-2 surface-2 border border-border rounded-full py-2.5 text-sm font-semibold hover:border-primary/40 hover:shadow-glass transition-all press">
            <SettingsIcon className="w-4 h-4" /> Settings
          </Link>
        </div>
      </div>

      {/* Key stats */}
      <div className={`grid ${isClient ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'} gap-3`}>
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="glass-card rounded-2xl p-4 elev-1 hover-lift animate-fade-in">
              <Icon className="w-5 h-5 text-primary mb-2" />
              <p className="text-xl font-heading font-bold nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Business info (client) */}
      {isClient && (
        <div className="glass-card rounded-2xl p-4 animate-fade-in space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            {profile?.company_name && <p className="font-heading font-semibold text-base">{profile.company_name}</p>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {profile?.industry && <span>{profile.industry}</span>}
            {profile?.country && <span>{profile.country}</span>}
            {profile?.company_size && <span>{profile.company_size}</span>}
          </div>
          {profile?.website && (
            <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary text-xs hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> {profile.website}
            </a>
          )}
          {profile?.business_description && <p className="text-sm text-muted-foreground pt-1">{profile.business_description}</p>}
          {profile?.categories && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {profile.categories.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                <span key={s} className="text-xs px-2 py-1 rounded-lg bg-secondary text-secondary-foreground">{s}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bio */}
      {profile?.bio && <div className="glass-card rounded-2xl p-4 animate-fade-in text-sm text-muted-foreground">{profile.bio}</div>}

      {/* Skills & professional details (creator) */}
      {!isClient && (
        <div className="glass-card rounded-2xl p-4 animate-fade-in space-y-4">
          {skills.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {skills.map(s => <span key={s} className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">{s}</span>)}
              </div>
            </div>
          )}
          {(profile?.years_experience || profile?.tools) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {profile?.years_experience && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Experience</p>
                  <p>{profile.years_experience} yrs</p>
                </div>
              )}
              {profile?.tools && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Tools</p>
                  <p className="text-muted-foreground">{profile.tools}</p>
                </div>
              )}
            </div>
          )}
          {profile?.portfolio_url && (
            <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Portfolio
            </a>
          )}
        </div>
      )}

      {/* Showcased Work (creator) */}
      {!isClient && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-heading text-lg font-semibold">Showcased work</h2>
            <Link to="/winners-hub" className="text-xs text-primary">View all</Link>
          </div>
          {posts.length === 0 ? (
            <AlertState
              type="empty"
              shape="blob"
              title="No showcased work yet"
              description="Share your best edits in Winners Hub."
              action={{ label: 'Go to Winners Hub', to: '/winners-hub' }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {posts.map(p => (
                <Link key={p.id} to={`/community/post/${p.id}`} className="aspect-square rounded-xl overflow-hidden bg-secondary hover-lift press">
                  {p.media_url ? <img src={p.media_url} alt={p.title || ''} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Verified reputation */}
      {!isClient && user?.id && <ClientReviews creatorId={user.id} />}
      {isClient && user?.id && <ClientReviews subject="client" clientId={user.id} />}
    </div>
  );
}