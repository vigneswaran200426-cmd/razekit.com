import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, Trophy, Grid3x3, MessageSquare, Info, BadgeCheck } from 'lucide-react';
import { entities } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money, dateShort } from '@/lib/format';
import { Card, Button, Badge, Avatar, Segmented, EmptyState, Spinner } from '@/components/ui';

function cover(id = '') { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return `linear-gradient(135deg, hsl(${h} 70% 60%), hsl(${(h + 40) % 360} 72% 46%))`; }

export default function CreatorProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(undefined);
  const [posts, setPosts] = useState([]);
  const [wins, setWins] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [tab, setTab] = useState('portfolio');

  useEffect(() => {
    entities.UserProfile.filter({ user_id: id }, '-created_date', 1).then((l) => setProfile((l || [])[0] || null)).catch(() => setProfile(null));
    entities.Post.filter({ author_id: id }, '-created_date', 60).then((l) => setPosts((l || []).filter((p) => p.media_url))).catch(() => {});
    Promise.all([entities.Contest.filter({ winner_user_id: id, status: 'completed' }, '-created_date', 60).catch(() => []), entities.Contest.filter({ winner_user_id: id, status: 'winner_selected' }, '-created_date', 60).catch(() => [])]).then(([a, b]) => setWins([...(a || []), ...(b || [])]));
    entities.Review.filter({ creator_id: id, status: 'published' }, '-created_date', 60).then((l) => setReviews(l || [])).catch(() => {});
  }, [id]);

  const rating = useMemo(() => reviews.length ? (reviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / reviews.length).toFixed(1) : null, [reviews]);
  const isMe = user?.id === id;
  const skills = (() => { try { return Array.isArray(profile?.skills) ? profile.skills : JSON.parse(profile?.skills || '[]'); } catch { return []; } })();

  if (profile === undefined) return <div className="min-h-[50vh] grid place-items-center"><Spinner className="w-7 h-7" /></div>;

  const name = profile?.display_name || profile?.username || 'Creator';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <div className="h-28" style={{ background: cover(id) }} />
        <div className="px-6 pb-6">
          <div className="flex items-end gap-4 -mt-10">
            <div className="rounded-full ring-4 ring-surface"><Avatar name={name} src={profile?.avatar_url} size={88} /></div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2"><h1 className="font-display text-2xl font-extrabold text-ink truncate">{name}</h1>{profile?.username && <BadgeCheck className="w-5 h-5 text-primary" />}</div>
              {profile?.professional_title && <p className="text-sm text-muted">{profile.professional_title}</p>}
            </div>
            <div className="pb-1">{isMe ? <Button to="/profile" variant="secondary">Edit profile</Button> : <Button variant="secondary"><MessageSquare className="w-4 h-4" />Message</Button>}</div>
          </div>
          {profile?.bio && <p className="mt-4 text-sm text-ink/90 leading-relaxed max-w-2xl">{profile.bio}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm"><Trophy className="w-4 h-4 text-warning" /><span className="font-semibold text-ink nums">{wins.length}</span><span className="text-muted">wins</span></span>
            {rating && <span className="flex items-center gap-1.5 text-sm"><Star className="w-4 h-4 fill-warning text-warning" /><span className="font-semibold text-ink nums">{rating}</span><span className="text-muted">({reviews.length})</span></span>}
            {skills.slice(0, 5).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
          </div>
        </div>
      </Card>

      <Segmented tabs={[{ key: 'portfolio', label: 'Portfolio' }, { key: 'wins', label: 'Wins' }, { key: 'reviews', label: 'Reviews' }]} value={tab} onChange={setTab} />

      {tab === 'portfolio' && (posts.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {posts.map((p) => (
            <Link key={p.id} to="/feed" className="group relative aspect-square rounded-lg overflow-hidden border border-line bg-ink">
              {/\.(mp4|webm|mov)/i.test(p.media_url) ? <video src={p.media_url} className="w-full h-full object-cover" /> : <img src={p.media_url} alt={p.title || ''} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
            </Link>
          ))}
        </div>
      ) : <EmptyState icon={Grid3x3} title="No portfolio work yet" description={isMe ? 'Share work on the feed to build your portfolio.' : 'This creator hasn’t posted work yet.'} action={isMe && <Button to="/feed">Share work</Button>} />)}

      {tab === 'wins' && (wins.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wins.map((c) => (
            <Link key={c.id} to={`/contest/${c.id}`} className="rounded-lg border border-line bg-surface overflow-hidden hover:shadow-md transition-all">
              <div className="relative aspect-[16/10]">{c.cover_image_url ? <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: cover(c.id) }} />}<Badge tone="success" className="absolute top-2.5 left-2.5"><Trophy className="w-3 h-3" />Won</Badge></div>
              <div className="p-3.5"><p className="font-display font-bold text-ink text-sm line-clamp-1">{c.title}</p><p className="font-display text-lg font-extrabold text-primary nums mt-1">{money(c.prize_amount, c.currency)}</p></div>
            </Link>
          ))}
        </div>
      ) : <EmptyState icon={Trophy} title="No wins yet" description="Winning contests will show here." />)}

      {tab === 'reviews' && (reviews.length ? (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center gap-1 mb-1.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-4 h-4 ${n <= (r.overall_rating || 0) ? 'fill-warning text-warning' : 'text-line-strong'}`} />)}{r.verified && <Badge tone="success" className="ml-2">Verified</Badge>}</div>
              {r.review_text && <p className="text-sm text-ink/90 leading-relaxed">“{r.review_text}”</p>}
              <p className="text-xs text-muted mt-2">{dateShort(r.created_date)}</p>
            </Card>
          ))}
        </div>
      ) : <EmptyState icon={MessageSquare} title="No reviews yet" description="Verified brand reviews appear after completed contests." />)}
    </div>
  );
}
