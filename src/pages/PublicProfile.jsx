import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Trophy, Star, Calendar, Award, ExternalLink, Building2, Briefcase, MapPin, Globe, Send, Lock, Flag } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile, getUserProfileByUsername } from '@/lib/username-utils';
import InviteToContextModal from '@/components/profile/InviteToContextModal';
import ReportModal from '@/components/community/ReportModal';
import ClientReviews from '@/components/reviews/ClientReviews';
import AlertState from '@/components/alerts/AlertState';

export default function PublicProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [publicStats, setPublicStats] = useState(null);
  const [posts, setPosts] = useState([]);
  const [wonContests, setWonContests] = useState([]);
  const [clientContests, setClientContests] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    (async () => {
      const [u, p] = await Promise.all([
        base44.auth.me().catch(() => null),
        getUserProfileByUsername(username).catch(() => null),
      ]);
      setMe(u);
      setProfile(p);
      if (u?.id) setMyProfile(await getUserProfile(u.id));
      if (p?.user_id) {
        const isBusiness = !!p.company_name;
        if (isBusiness) {
          const cs = await base44.entities.Contest.filter({ created_by_id: p.user_id }, '-created_date', 50).catch(() => []);
          setClientContests(cs.filter((c) => !c.private_contest && c.status !== 'draft'));
        } else {
          const [stats, ps, won] = await Promise.all([
            base44.entities.PublicCreatorStats.filter({ user_id: p.user_id }, '-created_date', 1).catch(() => []),
            base44.entities.Post.filter({ author_id: p.user_id, status: 'published' }, '-created_date', 9).catch(() => []),
            base44.entities.Contest.filter({ winner_user_id: p.user_id }, '-created_date', 12).catch(() => []),
          ]);
          setPublicStats(stats[0] || null);
          setPosts(ps);
          setWonContests(won.filter((c) => !c.private_contest));
        }
      }
      setLoading(false);
    })();
  }, [username]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <AlertState
          type="not-found"
          shape="ring"
          title="User not found"
          description={`@${username} doesn't exist`}
          action={{ label: 'Search creators', onClick: () => navigate('/search') }}
        />
      </div>
    );
  }

  const isOwner = me?.id === profile.user_id;
  const isBusiness = !!profile.company_name;
  const isPrivate = profile.profile_visibility === 'private' && !isOwner;
  const canShow = (flag, def = true) => isOwner || ((profile[flag] ?? def));
  const displayName = profile.display_name || profile.username;
  const memberSince = profile.created_date ? new Date(profile.created_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';

  // Visitor can't reach owner-only sections — render only public, read-only content.
  const canInvite = me?.user_role === 'client' && !isBusiness && !isOwner && !isPrivate;

  const headerActions = (
    <div className="flex gap-2 mt-5 w-full">
      {isOwner && (
        <Link to="/edit-profile" className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-full py-2.5 text-sm font-semibold press hover-lift shadow-primary-glow transition-all duration-200">
          <Pencil className="w-4 h-4" /> Edit profile
        </Link>
      )}
      {canInvite && (
        <button onClick={() => setShowInvite(true)} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-full py-2.5 text-sm font-semibold press hover:bg-[#0B48E8] hover:shadow-primary-glow hover:-translate-y-px active:scale-[0.98] transition-all duration-200">
          <Send className="w-4 h-4" /> Invite to contest
        </button>
      )}
      {!isOwner && (
        <button onClick={() => setShowReport(true)} className="flex-1 flex items-center justify-center gap-2 border border-border surface text-muted-foreground rounded-full py-2.5 text-sm font-medium press hover:text-foreground hover:shadow-glass transition-all">
          <Flag className="w-4 h-4" /> Report
        </button>
      )}
    </div>
  );

  // ---- Private profile (non-owner visitor) ----
  if (isPrivate) {
    return (
      <div className="min-h-screen bg-background">
        <BackBar label={`@${profile.username}`} onBack={() => navigate(-1)} />
        <div className="p-4 md:p-6 max-w-2xl mx-auto">
          <div className="surface elev-2 rounded-3xl p-8 flex flex-col items-center text-center animate-fade-in">
            <div className="w-20 h-20 rounded-2xl surface-muted flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="font-heading text-lg font-bold">{displayName}</p>
            <p className="text-sm text-primary">@{profile.username}</p>
            <p className="text-xs text-muted-foreground mt-3">This profile is private.</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Client (business) public profile ----
  if (isBusiness) {
    const active = clientContests.filter((c) => ['open', 'joined', 'working', 'submitted', 'reviewing'].includes(c.status));
    const completed = clientContests.filter((c) => ['winner_selected', 'completed'].includes(c.status));
    return (
      <div className="min-h-screen bg-background">
        <BackBar label={profile.company_name} onBack={() => navigate(-1)} />
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5 pb-8">
          <div className="glass-card rounded-2xl p-6 flex flex-col items-center text-center animate-fade-in">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center mb-4 overflow-hidden">
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-10 h-10 text-primary" />}
            </div>
            <p className="font-heading text-xl font-bold">{profile.company_name}</p>
            {profile.username && <p className="text-sm text-primary">@{profile.username}</p>}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              {profile.industry && <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> {profile.industry}</span>}
              {canShow('show_location') && profile.country && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {profile.country}</span>}
            </div>
            {(profile.bio || profile.business_description) && <p className="text-sm text-muted-foreground mt-3 max-w-sm">{profile.business_description || profile.bio}</p>}
            {canShow('show_website') && profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline">
                <Globe className="w-3.5 h-3.5" /> {profile.website}
              </a>
            )}
            {profile.categories && (
              <div className="flex flex-wrap gap-1.5 justify-center mt-3 max-w-sm">
                {profile.categories.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">{s}</span>
                ))}
              </div>
            )}
            {headerActions}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Projects" value={clientContests.length} icon={Briefcase} />
            <StatBox label="Active" value={active.length} icon={Trophy} />
            <StatBox label="Completed" value={completed.length} icon={Award} />
          </div>

          {profile.user_id && <ClientReviews subject="client" clientId={profile.user_id} />}

          {active.length > 0 && (
            <Section title="Active contests">
              {active.slice(0, 8).map((c) => <ContestRow key={c.id} contest={c} active />)}
            </Section>
          )}
          {canShow('show_completed_work') && completed.length > 0 && (
            <Section title="Completed contests">
              {completed.slice(0, 8).map((c) => <ContestRow key={c.id} contest={c} />)}
            </Section>
          )}
        </div>
        {showInvite && canInvite && (
          <InviteToContextModal creator={profile} clientUser={me} clientProfile={myProfile} onClose={() => setShowInvite(false)} />
        )}
        {showReport && me && (
          <ReportModal open={showReport} onClose={() => setShowReport(false)} targetType="profile" targetId={profile.id} reportedUserId={profile.user_id} user={me} />
        )}
      </div>
    );
  }

  // ---- Creator public profile ----
  const showStats = publicStats && (canShow('show_achievements') || canShow('show_ratings'));
  return (
    <div className="min-h-screen bg-background">
      <BackBar label={`@${profile.username}`} onBack={() => navigate(-1)} />
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5 pb-8">
        <div className="glass-card rounded-2xl p-6 flex flex-col items-center text-center animate-fade-in">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center overflow-hidden">
              {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="font-heading text-3xl font-bold text-primary">{displayName[0]?.toUpperCase()}</span>}
            </div>
            {/* featured badge removed — reputation now via verified Client Reviews */}
          </div>
          <p className="font-heading text-xl font-bold">{displayName}</p>
          <p className="text-sm text-primary">@{profile.username}</p>
          {profile.professional_title && <p className="text-sm text-muted-foreground mt-1">{profile.professional_title}</p>}
          {canShow('show_ratings') && publicStats?.rating ? (
            <p className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-secondary">
              <Star className="w-3.5 h-3.5 text-[#D78C05] fill-[#D78C05]" />
              {publicStats.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">· {publicStats.contests_won || 0} win{(publicStats.contests_won || 0) === 1 ? '' : 's'}</span>
            </p>
          ) : null}
          {profile.bio && <p className="text-sm text-muted-foreground mt-3 max-w-sm">{profile.bio}</p>}
          {profile.skills && (
            <div className="flex flex-wrap gap-1.5 justify-center mt-3 max-w-sm">
              {profile.skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => (
                <span key={s} className="text-xs px-2 py-1 rounded-lg bg-secondary text-secondary-foreground">{s}</span>
              ))}
            </div>
          )}
          {profile.tools && <p className="text-xs text-muted-foreground mt-2">Tools: {profile.tools}</p>}
          {canShow('show_portfolio') && profile.portfolio_url && (
            <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Portfolio
            </a>
          )}
          {headerActions}
        </div>

        {showStats && (
          <div className="grid grid-cols-2 gap-3">
            {canShow('show_achievements') && <StatBox label="Wins" value={publicStats.contests_won || 0} icon={Award} />}
            {canShow('show_ratings') && <StatBox label="Rating" value={publicStats.rating ? publicStats.rating.toFixed(1) : '—'} icon={Star} />}
          </div>
        )}
        {memberSince && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatBox label="Member since" value={memberSince} icon={Calendar} />
            <StatBox label="Completed" value={publicStats?.contests_completed || wonContests.length} icon={Award} />
          </div>
        )}

        {canShow('show_ratings') && profile.user_id && <ClientReviews creatorId={profile.user_id} />}

        {posts.length > 0 && (
          <Section title="Showcase">
            <div className="grid grid-cols-3 gap-2">
              {posts.map((p) => (
                <Link key={p.id} to={`/community/post/${p.id}`} className="aspect-square rounded-lg overflow-hidden bg-secondary">
                  {p.media_url ? <img src={p.media_url} alt={p.title || ''} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Trophy className="w-5 h-5 text-muted-foreground/40" /></div>}
                </Link>
              ))}
            </div>
          </Section>
        )}

        {canShow('show_completed_work') && wonContests.length > 0 && (
          <Section title="Winning work">
            {wonContests.slice(0, 8).map((c) => <ContestRow key={c.id} contest={c} won />)}
          </Section>
        )}
      </div>
      {showInvite && canInvite && (
        <InviteToContextModal creator={profile} clientUser={me} clientProfile={myProfile} onClose={() => setShowInvite(false)} />
      )}
      {showReport && me && (
        <ReportModal open={showReport} onClose={() => setShowReport(false)} targetType="profile" targetId={profile.id} reportedUserId={profile.user_id} user={me} />
      )}
    </div>
  );
}

function BackBar({ label, onBack }) {
  return (
    <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
      <button onClick={onBack} className="w-9 h-9 rounded-xl glass-card flex items-center justify-center press hover-lift">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <p className="font-heading font-semibold truncate">{label}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg font-semibold px-1">{title}</h2>
      {children}
    </div>
  );
}

function StatBox({ label, value, icon: Icon }) {
  return (
    <div className="surface elev-1 rounded-2xl p-4 text-center hover-lift animate-fade-in">
      <Icon className="w-5 h-5 text-primary/70 mx-auto mb-2" />
      <p className="font-heading text-lg font-bold nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ContestRow({ contest, active, won }) {
  return (
    <Link to={`/contest/${contest.id}`} className="surface rounded-2xl p-3.5 flex items-center justify-between gap-3 hover-lift transition-all">
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{contest.title}</p>
        <p className="text-xs text-muted-foreground">{contest.category}</p>
      </div>
      <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${won ? 'bg-success/15 text-success' : active ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
        {won ? 'Won' : active ? 'Active' : 'Completed'}
      </span>
    </Link>
  );
}