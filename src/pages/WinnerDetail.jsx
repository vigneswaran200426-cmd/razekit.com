import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Trophy, User, Building2, BadgeCheck, IndianRupee, Play, ExternalLink, Briefcase,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile } from '@/lib/username-utils';
import { placementLabel, WP_STATUS } from '@/lib/winner-publish';
import WinnerMedia from '@/components/winner/WinnerMedia';
import PublishedWinnerCard from '@/components/winner/PublishedWinnerCard';

// Public premium winner detail — media first, everything else supports the creative.
export default function WinnerDetail() {
  const { publishId } = useParams();
  const [data, setData] = useState({ loading: true });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const publish = await base44.entities.WinnerPublish.get(publishId).catch(() => null);
        if (!publish) { if (active) setData({ loading: false }); return; }
        const me = await base44.auth.me().catch(() => null);
        // Unpublished records are only reachable by their parties → route them to their workflow.
        if (publish.status !== WP_STATUS.PUBLISHED) {
          if (active) setData({ loading: false, publish, me, notPublic: true });
          return;
        }
        const [contest, creator, client, more] = await Promise.all([
          base44.entities.Contest.get(publish.contest_id).catch(() => null),
          getUserProfile(publish.creator_id).catch(() => null),
          getUserProfile(publish.client_id).catch(() => null),
          base44.entities.WinnerPublish.filter({ creator_id: publish.creator_id }, '-published_at', 8).catch(() => []),
        ]);
        base44.analytics.track({ eventName: 'winner_viewed', properties: { winner_id: publish.id, contest_id: publish.contest_id } }).catch(() => {});
        if (active) setData({ loading: false, publish, contest, creator, client, more: more.filter((m) => m.id !== publish.id && m.status === WP_STATUS.PUBLISHED) });
      } catch {
        if (active) setData({ loading: false });
      }
    })();
    return () => { active = false; };
  }, [publishId]);

  if (data.loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  if (!data.publish) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center">
        <Trophy className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="font-heading font-bold">Winner not found</p>
        <p className="text-sm text-muted-foreground mt-1">This winning work may have been removed.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/winners-hub">Back to Winners Hub</Link></Button>
      </div>
    );
  }

  const { publish, me, notPublic } = data;
  if (notPublic) {
    const isCreator = me?.id === publish.creator_id;
    const isClient = me?.id === publish.client_id;
    const to = isCreator ? `/contest/${publish.contest_id}/winner-content` : isClient ? `/contest/${publish.contest_id}/winner-approval` : '/winners-hub';
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center">
        <Trophy className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="font-heading font-bold">This winning work isn't public yet</p>
        <p className="text-sm text-muted-foreground mt-1">It publishes to the Winners Hub once approved.</p>
        <Button asChild className="mt-4"><Link to={to}>Open my winner workflow</Link></Button>
      </div>
    );
  }

  const { contest, creator, client, more } = data;
  const creatorName = creator?.display_name || creator?.username || `Creator #${publish.creator_id?.slice(-4)?.toUpperCase()}`;
  const clientName = client?.company_name || client?.display_name || client?.username || 'Client';
  const date = publish.published_at ? new Date(publish.published_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const brief = (contest?.short_description || contest?.description || '').replace(/<[^>]+>/g, ' ').trim();

  return (
    <div className="pb-12">
      {/* Media hero — the creative is the page */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <Link to="/winners-hub" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Winners Hub
        </Link>
        <div className="rounded-3xl overflow-hidden bg-black/5 shadow-glass-lg">
          <WinnerMedia
            publish={publish}
            className="w-full aspect-video"
            onPlay={() => base44.analytics.track({ eventName: 'winner_video_played', properties: { winner_id: publish.id } }).catch(() => {})}
          />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Title + placement */}
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-success/10 text-success font-semibold">
            <Trophy className="w-3.5 h-3.5" /> {placementLabel(publish.placement || 1)} Winner
          </span>
          <h1 className="font-heading text-3xl md:text-4xl font-extrabold tracking-tight mt-2">{publish.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{publish.category || 'Creative'}{date && ` · Published ${date}`}</p>
        </div>

        {/* Facts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Fact icon={User} label="Creator" value={creatorName} />
          <Fact icon={Building2} label="Brand" value={clientName} />
          <Fact icon={Briefcase} label="Contest" value={contest?.title || '—'} />
          <Fact icon={IndianRupee} label="Prize" value={`₹${(publish.prize_amount || 0).toLocaleString('en-IN')}`} />
        </div>

        {/* Story */}
        {(publish.description || publish.creator_note) && (
          <div className="glass-card rounded-2xl p-5 md:p-6 space-y-4">
            {publish.description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">About the work</p>
                <p className="text-sm text-foreground/90 leading-relaxed">{publish.description}</p>
              </div>
            )}
            {publish.creator_note && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Winning story · from {creatorName}</p>
                <p className="text-sm text-foreground/90 leading-relaxed">{publish.creator_note}</p>
              </div>
            )}
            {(publish.tools_used || publish.social_links) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {publish.tools_used?.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                ))}
                {publish.social_links && (
                  <a href={publish.social_links.startsWith('http') ? publish.social_links : `https://${publish.social_links}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1 hover:underline">
                    <Play className="w-3 h-3" /> {publish.social_links.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* About the contest */}
        {contest && (brief || contest.category) && (
          <div className="glass-card rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About the contest</p>
              <Link to={`/contest/${contest.id}`} className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline">View contest <ExternalLink className="w-3 h-3" /></Link>
            </div>
            <h3 className="font-heading font-semibold">{contest.title}</h3>
            {brief && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{brief}</p>}
          </div>
        )}

        {/* Profile previews */}
        <div className="grid sm:grid-cols-2 gap-3">
          <ProfileCard
            to={creator?.username ? `/u/${creator.username}` : null}
            avatar={creator?.avatar_url}
            name={creatorName}
            verified={!!creator}
            sub={creator?.professional_title || 'Video Creator'}
            label="Creator"
          />
          <ProfileCard
            to={client?.username ? `/u/${client.username}` : contest ? `/contest/${contest.id}` : null}
            avatar={client?.avatar_url}
            name={clientName}
            verified={false}
            sub={client?.industry || 'Brand'}
            label="Client"
          />
        </div>

        {/* More winning work */}
        {more?.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-heading text-lg font-semibold px-1">More Winning Work by {creatorName}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {more.slice(0, 6).map((m, i) => <PublishedWinnerCard key={m.id} publish={m} creator={creator} client={client} index={i} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 card-shadow">
      <Icon className="w-4 h-4 text-primary mb-1.5" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
    </div>
  );
}

function ProfileCard({ to, avatar, name, verified, sub, label }) {
  const inner = (
    <div className="glass-card rounded-2xl p-4 flex items-center gap-3 h-full hover:shadow-glass-lg transition-shadow">
      {avatar
        ? <img src={avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        : <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-heading font-bold shrink-0">{name?.[0]?.toUpperCase()}</span>}
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold truncate inline-flex items-center gap-1">
          {name}{verified && <BadgeCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
        </p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}