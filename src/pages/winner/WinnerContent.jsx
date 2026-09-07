import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Trophy, IndianRupee, PartyPopper, Lock, Clock, Loader2,
  RefreshCw, LifeBuoy, CheckCircle2, Sparkles, Building2,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getUserProfile } from '@/lib/username-utils';
import { useToast } from '@/components/ui/use-toast';
import { getWinnerPublish, submitWinnerContent, saveWinnerContentDraft, retryWinnerPublishing, WP_STATUS } from '@/lib/winner-publish';
import WinnerPublishTimeline, { WinnerPublishStatusPill } from '@/components/winner/WinnerPublishTimeline';
import WinnerContentForm from '@/components/winner/WinnerContentForm';
import WinnerHubPreview from '@/components/winner/WinnerHubPreview';
import WinnerMedia from '@/components/winner/WinnerMedia';
import { generateThumbnailBlob } from '@/lib/submission-utils';

export default function WinnerContent() {
  const { id } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState({ loading: true });
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    try {
      const [contest, me] = await Promise.all([
        base44.entities.Contest.get(id),
        base44.auth.me().catch(() => null),
      ]);
      const publish = await getWinnerPublish(id);
      const clientProfile = publish?.client_id ? await getUserProfile(publish.client_id).catch(() => null) : null;
      setData({ loading: false, contest, me, publish, clientProfile });
    } catch {
      setData({ loading: false, contest: null });
    }
  };
  useEffect(() => { reload(); }, [id]);

  if (data.loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!data.contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;

  const { contest, me, publish, clientProfile } = data;
  if (!me || contest.winner_user_id !== me.id) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto min-h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4"><Lock className="w-7 h-7 text-muted-foreground" /></div>
        <p className="font-heading font-bold">This page is for the winning creator</p>
        <Button asChild variant="outline" className="mt-4"><Link to={`/contest/${id}`}>Back to contest</Link></Button>
      </div>
    );
  }

  const brand = clientProfile?.company_name || clientProfile?.display_name || 'the brand';
  const st = publish?.status;
  const isRevision = st === WP_STATUS.REVISION_REQUESTED;

  // ── Submit: upload private media → generate cover if needed → transition ──
  const handleSubmit = async ({ fields, mediaFile, thumbFile }) => {
    setSubmitting(true);
    try {
      const isImage = !mediaFile.type.startsWith('video/');
      const { file_uri: mediaUri } = await base44.integrations.Core.UploadPrivateFile({ file: mediaFile });
      let thumbUri = '';
      if (thumbFile) {
        const up = await base44.integrations.Core.UploadPrivateFile({ file: thumbFile });
        thumbUri = up.file_uri;
      } else if (!isImage) {
        const blob = await generateThumbnailBlob(URL.createObjectURL(mediaFile));
        if (blob) {
          const up = await base44.integrations.Core.UploadPrivateFile({ file: new File([blob], 'cover.jpg', { type: 'image/jpeg' }) });
          thumbUri = up.file_uri;
        }
      }
      const updated = await submitWinnerContent(publish, {
        ...fields,
        media_uri: mediaUri,
        media_type: isImage ? 'image' : 'video',
        thumbnail_uri: thumbUri,
      });
      setData((d) => ({ ...d, publish: updated }));
      toast({ title: 'Submitted for brand approval', description: 'Your winning work is now with the brand for review.' });
    } catch (e) {
      toast({ title: 'Upload failed', description: e?.message || 'Your work has not been submitted. Please retry.', variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const handleDraft = async (fields) => {
    try {
      await saveWinnerContentDraft(publish, fields);
      toast({ title: 'Draft saved' });
    } catch {
      toast({ title: 'Could not save draft', variant: 'destructive' });
    }
  };

  const handleRetry = async () => {
    try {
      const updated = await retryWinnerPublishing(publish);
      setData((d) => ({ ...d, publish: updated }));
      toast({ title: 'Retrying…', description: 'Preparing your winning work for the Winners Hub.' });
      setTimeout(reload, 4000);
    } catch {
      toast({ title: 'Still failing', description: 'Our team has been notified. You can also contact support.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-10 space-y-4">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      {/* Congratulations header */}
      <div className="glass-card rounded-2xl p-6 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-sky-gradient text-primary flex items-center justify-center mx-auto mb-3">
          <PartyPopper className="w-7 h-7" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Congratulations — you won</p>
        <h1 className="font-heading text-2xl font-bold">{contest.title}</h1>
        <div className="flex items-center justify-center gap-1 text-primary font-heading font-bold text-xl mt-2">
          <IndianRupee className="w-5 h-5" />{contest.prize_amount?.toLocaleString('en-IN')}
        </div>
        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1"><Building2 className="w-3.5 h-3.5" /> {brand}</p>
        <div className="mt-3"><WinnerPublishStatusPill status={st} /></div>
      </div>

      <WinnerPublishTimeline contest={contest} publish={publish} role="creator" />

      {/* Stage: prize not yet confirmed */}
      {st === WP_STATUS.WINNER_SELECTED && (
        <div className="glass-card rounded-2xl p-5 flex items-center gap-3 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-secondary text-primary flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-semibold">Waiting for prize confirmation</p>
            <p className="text-xs text-muted-foreground">Your Winners Hub upload task opens as soon as the prize is confirmed.</p>
          </div>
        </div>
      )}

      {/* Stage: upload (first time or revision) */}
      {(st === WP_STATUS.CONTENT_REQUESTED || isRevision) && (
        <>
          <div className="glass-card rounded-2xl p-5 animate-fade-in">
            <p className="font-heading font-semibold mb-1">{isRevision ? 'Apply the requested changes' : 'Prepare your winning entry for Winners Hub'}</p>
            <p className="text-sm text-muted-foreground">Showcase the work that won. Your approved entry may be featured in the Razekit Winners Hub.</p>
          </div>
          {isRevision && publish.revision_feedback && (
            <div className="glass-card rounded-2xl p-5 border-l-4 border-warning animate-fade-in">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#D78C05] mb-1">Brand feedback</p>
              <p className="text-sm text-foreground/90">{publish.revision_feedback}</p>
            </div>
          )}
          <WinnerContentForm contest={contest} publish={publish} submitting={submitting} onSubmit={handleSubmit} onDraft={handleDraft} />
        </>
      )}

      {/* Stage: waiting for client approval */}
      {st === WP_STATUS.SUBMITTED && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-2xl p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 text-[#D78C05] flex items-center justify-center shrink-0"><Clock className="w-5 h-5" /></div>
            <div>
              <p className="text-sm font-semibold">Waiting for brand approval</p>
                        <p className="text-xs text-muted-foreground">The brand has been notified. We'll tell you the moment it's live.</p>
            </div>
          </div>
          {publish?.media_uri && <WinnerMedia publish={publish} className="w-full aspect-video rounded-2xl overflow-hidden bg-black/5" />}
        </div>
      )}

      {/* Stage: processing (with failure retry) */}
      {(st === WP_STATUS.APPROVED || st === WP_STATUS.PROCESSING) && (
        <div className="glass-card rounded-2xl p-5 animate-fade-in">
          {publish?.publish_error ? (
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 text-[#D78C05] flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-semibold">Preparing hit a snag</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your approved work is safe. Retry, or contact support if it keeps failing.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRetry} size="sm"><RefreshCw className="w-4 h-4" /> Retry Processing</Button>
                <Button asChild variant="outline" size="sm"><Link to="/help" state={{ from: `/contest/${id}/winner` }}><LifeBuoy className="w-4 h-4" /> Contact Support</Link></Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <div>
                <p className="text-sm font-semibold">Preparing your winning work...</p>
                <p className="text-xs text-muted-foreground">Razekit is processing your approved entry for the Winners Hub.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stage: published */}
      {st === WP_STATUS.PUBLISHED && (
        <div className="glass-card rounded-2xl p-6 text-center animate-fade-in">
          <div className="w-14 h-14 rounded-2xl bg-success/10 text-success flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="w-7 h-7" /></div>
          <p className="font-heading font-bold text-lg">Your work is officially showcased</p>
          <p className="text-sm text-muted-foreground mt-1">Your winning entry is live in the Razekit Winners Hub.</p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
            <Button asChild><Link to={`/winner/${publish.id}`}><Trophy className="w-4 h-4" /> View your Winners Hub page</Link></Button>
            <Button asChild variant="outline"><Link to="/winners-hub">Open Winners Hub</Link></Button>
          </div>
        </div>
      )}
    </div>
  );
}