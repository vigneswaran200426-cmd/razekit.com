import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Trophy, CheckCircle2, Clock, Lock, Loader2, MessageSquareText,
  RefreshCw, LifeBuoy, User, Building2, Send,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile } from '@/lib/username-utils';
import { useToast } from '@/components/ui/use-toast';
import { getWinnerPublish, approveAndPublishWinner, requestWinnerRevision, retryWinnerPublishing, WP_STATUS } from '@/lib/winner-publish';
import WinnerPublishTimeline, { WinnerPublishStatusPill } from '@/components/winner/WinnerPublishTimeline';
import WinnerMedia from '@/components/winner/WinnerMedia';
import WinnerHubPreview from '@/components/winner/WinnerHubPreview';

const QUICK_CHANGES = ['Replace thumbnail', 'Replace video', 'Update title', 'Update caption'];

// Client review screen — approve & publish, or request changes.
export default function WinnerApproval() {
  const { id } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionText, setRevisionText] = useState('');

  const reload = async () => {
    try {
      const [contest, me] = await Promise.all([
        base44.entities.Contest.get(id),
        base44.auth.me().catch(() => null),
      ]);
      const publish = await getWinnerPublish(id);
      const [creatorProfile, clientProfile] = await Promise.all([
        publish?.creator_id ? getUserProfile(publish.creator_id).catch(() => null) : null,
        me?.id ? getUserProfile(me.id).catch(() => null) : null,
      ]);
      setData({ loading: false, contest, me, publish, creatorProfile, clientProfile });
    } catch {
      setData({ loading: false, contest: null });
    }
  };
  useEffect(() => { reload(); }, [id]);

  if (data.loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!data.contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;

  const { contest, me, publish, creatorProfile, clientProfile } = data;
  if (!me || contest.created_by_id !== me.id) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4"><Lock className="w-7 h-7 text-muted-foreground" /></div>
        <p className="font-heading font-bold">Only the contest brand can review winner content</p>
        <Button asChild variant="outline" className="mt-4"><Link to={`/contest/${id}`}>Back to contest</Link></Button>
      </div>
    );
  }

  const st = publish?.status;
  const creatorName = creatorProfile?.display_name || creatorProfile?.username || `Creator #${publish?.creator_id?.slice(-4)?.toUpperCase()}`;

  const handleApprove = async () => {
    setBusy(true);
    try {
      const updated = await approveAndPublishWinner(publish);
      setData((d) => ({ ...d, publish: updated }));
      toast({ title: 'Winner published', description: 'The winning work is now live in the Winners Hub.' });
    } catch {
      toast({ title: 'Publishing failed', description: 'We kept your approval. Retry processing in a moment.', variant: 'destructive' });
      await reload();
    } finally { setBusy(false); }
  };

  const handleRevision = async () => {
    if (!revisionText.trim()) {
      toast({ title: 'Add your feedback', description: 'Tell the creator what needs to change.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const updated = await requestWinnerRevision(publish, revisionText.trim());
      setData((d) => ({ ...d, publish: updated }));
      setRevisionOpen(false);
      setRevisionText('');
      toast({ title: 'Revision request sent', description: 'The creator has been notified.' });
    } catch {
      toast({ title: 'Could not send revision request', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const handleRetry = async () => {
    setBusy(true);
    try {
      const updated = await retryWinnerPublishing(publish);
      setData((d) => ({ ...d, publish: updated }));
      setTimeout(reload, 4000);
    } catch {
      toast({ title: 'Still failing', description: 'Please contact support.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-10 space-y-4">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="glass-card rounded-2xl p-5 animate-fade-in">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Winner content</p>
        <h1 className="font-heading text-2xl font-bold">{contest.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Trophy className="w-4 h-4 text-primary" /> 1st Place</span>
          <span className="inline-flex items-center gap-1"><User className="w-4 h-4" /> {creatorName}</span>
        </div>
        <div className="mt-3"><WinnerPublishStatusPill status={st} /></div>
      </div>

      <WinnerPublishTimeline contest={contest} publish={publish} role="client" />

      {/* Waiting states */}
      {(st === WP_STATUS.WINNER_SELECTED || st === WP_STATUS.CONTENT_REQUESTED) && (
        <div className="glass-card rounded-2xl p-5 flex items-center gap-3 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-secondary text-primary flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-semibold">Awaiting winner content</p>
            <p className="text-xs text-muted-foreground">The winning creator has been asked to prepare their entry for the Winners Hub.</p>
          </div>
        </div>
      )}

      {/* Revision waiting */}
      {st === WP_STATUS.REVISION_REQUESTED && (
        <div className="glass-card rounded-2xl p-5 flex items-center gap-3 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-warning/10 text-[#D78C05] flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-semibold">Waiting for the creator</p>
            <p className="text-xs text-muted-foreground">Revision request sent. The creator is updating the content.</p>
          </div>
        </div>
      )}

      {/* Review */}
      {st === WP_STATUS.SUBMITTED && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-2xl p-5 border-l-4 border-primary">
            <p className="font-heading font-semibold">Review before publishing</p>
            <p className="text-sm text-muted-foreground mt-0.5">This will publish the winning work to the public Winners Hub.</p>
          </div>

          {publish?.media_uri && (
            <WinnerMedia publish={publish} className="w-full aspect-video rounded-2xl overflow-hidden bg-black/5" />
          )}

          <div className="glass-card rounded-2xl p-5 space-y-3">
            <Field label="Title" value={publish.title} />
            {publish.description && <Field label="Description" value={publish.description} />}
            {publish.caption && <Field label="Caption" value={publish.caption} />}
            {publish.creator_note && <Field label="Creator note" value={publish.creator_note} />}
            {publish.tools_used && <Field label="Tools used" value={publish.tools_used} />}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Public preview</p>
            <WinnerHubPreview draft={publish} creator={creatorProfile} client={clientProfile} isVideo={publish.media_type !== 'image'} />
          </div>

          {!revisionOpen ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleApprove} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve & Publish
              </Button>
              <Button variant="outline" onClick={() => setRevisionOpen(true)} disabled={busy} className="flex-1">
                <MessageSquareText className="w-4 h-4" /> Request Changes
              </Button>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-5 space-y-3 animate-fade-in">
              <p className="font-heading font-semibold text-sm">What needs to be changed?</p>
              <textarea
                value={revisionText} onChange={(e) => setRevisionText(e.target.value)} rows={4}
                placeholder="e.g. Please use a brighter cover frame and shorten the caption."
                className="w-full rounded-xl border border-input bg-white/60 px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_CHANGES.map((c) => (
                  <button key={c} type="button" onClick={() => setRevisionText((t) => (t ? `${t} ${c.toLowerCase()}` : c))}
                    className="text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors">{c}</button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button variant="ghost" onClick={() => setRevisionOpen(false)} disabled={busy}>Cancel</Button>
                <Button onClick={handleRevision} disabled={busy}>
                  <Send className="w-4 h-4" /> Send Revision Request
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing */}
      {(st === WP_STATUS.APPROVED || st === WP_STATUS.PROCESSING) && (
        <div className="glass-card rounded-2xl p-5 animate-fade-in">
          {publish?.publish_error ? (
            <div className="flex flex-col items-center text-center gap-3">
              <p className="text-sm font-semibold">Processing failed</p>
              <p className="text-xs text-muted-foreground">{publish.publish_error}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRetry} disabled={busy}><RefreshCw className="w-4 h-4" /> Retry Processing</Button>
                <Button asChild variant="outline" size="sm"><Link to="/help" state={{ from: `/contest/${id}/winner` }}><LifeBuoy className="w-4 h-4" /> Contact Support</Link></Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <div>
                <p className="text-sm font-semibold">Preparing for Winners Hub...</p>
                <p className="text-xs text-muted-foreground">Your approval is recorded. The entry publishes automatically when processing finishes.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Published */}
      {st === WP_STATUS.PUBLISHED && (
        <div className="glass-card rounded-2xl p-6 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-success/10 text-success flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="w-7 h-7" /></div>
          <p className="font-heading font-bold text-lg">Published to Winners Hub</p>
          <p className="text-sm text-muted-foreground mt-1">The winning work is now public.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
            <Button asChild><Link to={`/winner/${publish.id}`}><Trophy className="w-4 h-4" /> View Published Winner</Link></Button>
            <Button asChild variant="outline"><Link to="/winners-hub"><Building2 className="w-4 h-4" /> Open Winners Hub</Link></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="bg-secondary/40 rounded-xl px-3.5 py-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}