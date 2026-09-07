import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Trophy, Download, Play, IndianRupee, ArrowLeft, Check, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getHandover, handoverUnlocksPayment } from '@/lib/handover-utils';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';

export default function Results() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);
  const [winner, setWinner] = useState(null);
  const [submissionsCount, setSubmissionsCount] = useState(0);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [delivered, setDelivered] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [c, u] = await Promise.all([
          base44.entities.Contest.get(id),
          base44.auth.me().catch(() => null),
        ]);
        setContest(c);
        setUser(u);
        if (c.winner_submission_id) {
          const subs = await base44.entities.Submission.filter({ contest_id: id }).catch(() => []);
          setSubmissionsCount(subs.length);
          const w = subs.find((s) => s.id === c.winner_submission_id);
          setWinner(w);
          setDelivered(w?.delivery_status === 'delivered' || c.delivery_status === 'delivered' || c.status === 'completed');
        }
      } catch (e) {} finally { setLoading(false); }
    })();
  }, [id]);

  const handleDownload = async () => {
    if (!winner?.final_asset_uri) {
      toast({ title: 'No final file', description: 'The winner did not upload a final asset.', variant: 'destructive' });
      return;
    }
    setDownloading(true);
    let handoverPending = false;
    try {
      const s = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: winner.final_asset_uri, expires_in: 300 });
      const url = s?.signed_url;
      if (!url) throw new Error('No signed URL returned');
      // Log the download
      await base44.entities.DownloadLog.create({
        submission_id: winner.id, contest_id: id, user_id: user?.id || '', status: 'success',
      }).catch(() => {});
      // Mark delivered. The contest only becomes "completed" once the account
      // handover is confirmed by both sides (gated; download itself is unaffected).
      await base44.entities.Submission.update(winner.id, { delivery_status: 'delivered' }).catch(() => {});
      const handover = await getHandover(id).catch(() => null);
      if (handoverUnlocksPayment(handover)) {
        await base44.entities.Contest.update(id, {
          delivery_status: 'delivered',
          completed_at: contest.completed_at || new Date().toISOString(),
          status: 'completed',
        }).catch(() => {});
      } else {
        handoverPending = true;
        await base44.entities.Contest.update(id, { delivery_status: 'delivered' }).catch(() => {});
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(contest.title || 'final').replace(/\s+/g, '-')}-final.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDelivered(true);
      toast({
        title: 'Download started',
        description: handoverPending ? 'Your final file is downloading. Complete the account handover to finish this contest.' : 'Your final file is downloading.',
      });
    } catch (e) {
      toast({ title: 'Download failed', description: 'Could not generate a secure download link.', variant: 'destructive' });
    } finally { setDownloading(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;
  if (!winner) return (
    <div className="p-4 md:p-6 max-w-md mx-auto pb-8">
      <AlertState
        type="processing"
        shape="ring"
        title="Results not ready yet"
        description="Winner has not been selected yet."
        action={{ label: 'Back to contest', to: `/contest/${id}` }}
      />
    </div>
  );

  const completionPct = contest.status === 'completed' ? 100 : 75;

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto pb-8">
      <div className="mb-6">
        <PageHeader
          title="Results"
          subtitle={contest.title}
          icon={Trophy}
          backTo={`/contest/${id}`}
          backLabel="Back"
        />
      </div>

      <div className="surface elev-2 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-0.5">Winner</p>
            <p className="font-heading font-bold leading-tight">Creator #{winner.created_by_id?.slice(-4)?.toUpperCase()}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="surface-muted rounded-xl py-2">
            <p className="text-sm font-heading font-bold flex items-center justify-center text-primary nums"><IndianRupee className="w-3.5 h-3.5" />{contest.prize_amount?.toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-muted-foreground">Prize</p>
          </div>
          <div className="surface-muted rounded-xl py-2">
            <p className="text-sm font-heading font-bold nums">{submissionsCount}</p>
            <p className="text-[10px] text-muted-foreground">Entries</p>
          </div>
          <div className="surface-muted rounded-xl py-2">
            <p className="text-sm font-heading font-bold capitalize">{contest.delivery_status || 'pending'}</p>
            <p className="text-[10px] text-muted-foreground">Delivery</p>
          </div>
        </div>
      </div>

      <div className="glass-card elev-1 rounded-2xl p-4 mb-4 animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Project Preview</p>
        <div className="aspect-video bg-secondary rounded-xl flex items-center justify-center overflow-hidden">
          {winner.preview_asset || winner.video_url ? (
            <video src={winner.preview_asset || winner.video_url} controls className="w-full h-full" />
          ) : (
            <div className="text-center">
              <Play className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No preview available</p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card elev-1 rounded-2xl p-4 mb-4 animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Completion</span>
          <span className="text-xs font-medium">{completionPct}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden mb-3">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completionPct}%` }} />
        </div>
        {delivered ? (
          <div className="flex items-center gap-2 text-success text-sm font-medium">
            <Check className="w-4 h-4" /> Final file delivered
          </div>
        ) : (
          <div className="flex items-center gap-2 text-primary text-sm font-medium">
            <Clock className="w-4 h-4" /> Final file ready to download
          </div>
        )}
      </div>

      <div className="space-y-3 pt-1">
        <Button onClick={handleDownload} disabled={downloading} className="w-full h-12 text-base font-semibold rounded-full press" size="lg">
          {downloading ? 'Preparing download...' : <><Download className="w-4 h-4 mr-2" /> Download Final</>}
        </Button>
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link to="/my-contests">View Completed Work</Link>
        </Button>
      </div>
    </div>
  );
}