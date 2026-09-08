import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Settings as SettingsIcon, Briefcase, Star, Trophy, ShieldCheck, Image as ImageIcon, Activity, ExternalLink, Building2 } from 'lucide-react';
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
        const [rv, ps] = await Promise.all([
          base44.entities.Review.filter({ creator_id: userData.id, status: 'published' }, '-created_date', 100).catch(() => []),
          base44.entities.Post.filter({ author_id: userData.id, status: 'published' }, '-created_date', 9).catch(() => []),
        ]);
        setReviews(rv.filter((r) => (r.reviewer_role || 'client') === 'client'));
        setPosts(ps);
      }
    });
  }, []);

  const isClient = user?.user_role === 'client';
  const userName = user?.full_name || user?.email?.split('@')[0] || 'Creator';
  const professionalTitle = isClient ? (profile?.company_name || 'Brand') : (profile?.professional_title || 'Creator');
  const myContests = contests.filter((c) => c.created_by_id === user?.id);
  const completedContests = myContests.filter((c) => ['winner_selected', 'completed'].includes(c.status));
  const activeContests = myContests.filter((c) => ['open', 'joined', 'working', 'submitted', 'reviewing'].includes(c.status));
  const wins = contests.filter((c) => c.winner_user_id === user?.id && ['winner_selected', 'completed'].includes(c.status)).length;
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / reviews.length).toFixed(1) : null;
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
  const skills = profile?.skills ? profile.skills.split(',').map((s) => s.trim()).filter(Boolean) : [];

  return (
    <div className="page-shell pb-10">
      <div className="max-w-[1100px] mx-auto space-y-5">
        <header className="surface-2 p-5 md:p-7 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : isClient ? <Briefcase className="w-8 h-8 text-primary" /> : <span className="font-heading text-3xl font-bold text-primary">{userName.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-primary">RazeKit profile</p>
              <div className="flex flex-wrap items-center gap-2 mt-1"><h1 className="font-heading text-2xl font-bold tracking-tight truncate">{userName}</h1><RoleBadge role={user?.user_role || 'creator'} /></div>
              {profile?.username && <p className="text-sm text-primary mt-0.5">@{profile.username}</p>}
              <p className="text-sm text-muted-foreground mt-0.5">{professionalTitle}</p>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              <Link to="/edit-profile" className="rz-primary-action inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"><Pencil className="w-4 h-4" /> Edit profile</Link>
              <Link to="/settings" className="rz-secondary-action inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold"><SettingsIcon className="w-4 h-4" /><span className="sr-only sm:not-sr-only">Settings</span></Link>
            </div>
          </div>
        </header>

        <div className={`grid ${isClient ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'} gap-3`}>
          {stats.map(({ label, value, icon: Icon }) => <div key={label} className="surface p-4"><Icon className="w-5 h-5 text-primary mb-2" /><p className="text-xl font-heading font-bold nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}
        </div>

        {isClient && <section className="surface p-5 space-y-3">
          <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /><h2 className="font-heading font-semibold text-base">Organization</h2></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{profile?.company_name && <span className="font-medium text-foreground">{profile.company_name}</span>}{profile?.industry && <span>{profile.industry}</span>}{profile?.country && <span>{profile.country}</span>}{profile?.company_size && <span>{profile.company_size}</span>}</div>
          {profile?.website && <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary text-xs hover:underline"><ExternalLink className="w-3.5 h-3.5" /> {profile.website}</a>}
          {profile?.business_description && <p className="text-sm text-muted-foreground">{profile.business_description}</p>}
          {profile?.categories && <div className="flex flex-wrap gap-1.5">{profile.categories.split(',').map((s) => s.trim()).filter(Boolean).map((s) => <span key={s} className="text-xs px-2 py-1 rounded-lg bg-secondary text-secondary-foreground">{s}</span>)}</div>}
        </section>}

        {profile?.bio && <section className="surface p-5"><h2 className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground mb-2">About</h2><p className="text-sm leading-relaxed text-foreground/85">{profile.bio}</p></section>}

        {!isClient && <section className="surface p-5 space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-heading text-lg font-semibold">Professional profile</h2><span className="text-xs text-muted-foreground">Real work & outcomes</span></div>
          {skills.length > 0 && <div><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground mb-2">Skills</p><div className="flex flex-wrap gap-1.5">{skills.map((s) => <span key={s} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-medium">{s}</span>)}</div></div>}
          <div className="grid sm:grid-cols-2 gap-4 text-sm"><div><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground mb-1">Experience</p><p>{profile?.years_experience ? `${profile.years_experience} years` : 'Not added'}</p></div><div><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-muted-foreground mb-1">Tools</p><p className="text-muted-foreground">{profile?.tools || 'Not added'}</p></div></div>
          {profile?.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="w-3.5 h-3.5" /> External portfolio</a>}
        </section>}

        {!isClient && <section className="space-y-2"><div className="flex items-center justify-between px-1"><h2 className="font-heading text-lg font-semibold">Showcased work</h2><Link to="/winners-hub" className="text-xs font-semibold text-primary">Winners Hub</Link></div>{posts.length === 0 ? <AlertState type="empty" shape="blob" title="No showcased work yet" description="Your winning and featured work will appear here when published." action={{ label: 'Explore Winners', to: '/winners-hub' }} /> : <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{posts.map((p) => <Link key={p.id} to={`/community/post/${p.id}`} className="aspect-square rounded-lg overflow-hidden bg-secondary hover-lift press">{p.media_url ? <img src={p.media_url} alt={p.title || ''} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-5 h-5 text-muted-foreground" /></div>}</Link>)}</div>}</section>}

        {user?.id && <ClientReviews subject={isClient ? 'client' : undefined} clientId={isClient ? user.id : undefined} creatorId={!isClient ? user.id : undefined} />}
      </div>
    </div>
  );
}
