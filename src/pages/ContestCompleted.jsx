import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Trophy, Check, Users, Share2, ArrowLeft, IndianRupee, ArrowLeftRight, Play, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getHandover, HANDOVER_STATUS_LABELS } from '@/lib/handover-utils';
import { useToast } from '@/components/ui/use-toast';
import { canClientReview, canWinnerReviewClient, hasClientReviewedCreator, hasCreatorReviewedClient } from '@/lib/review-utils';
import LeaveReviewModal from '@/components/reviews/LeaveReviewModal';
import AlertState from '@/components/alerts/AlertState';

// Final screen once handover and payment are complete — the contest is Done.
export default function ContestCompleted() {
  const { id } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState({ loading: true });
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const contest = await base44.entities.Contest.get(id);
        const [submissions, handover, me] = await Promise.all([
          base44.entities.Submission.filter({ contest_id: id }, '-created_date', 100).catch(() => []),
          getHandover(id).catch(() => null),
          base44.auth.me().catch(() => null),
        ]);
        let reviewed = false;
        if (me?.id && contest) {
          reviewed = contest.winner_user_id && contest.created_by_id === me.id
            ? await hasClientReviewedCreator(me.id, id)
            : contest.winner_user_id === me.id ? await hasCreatorReviewedClient(me.id, id) : false;
        }
        setData({ loading: false, contest, submissions, handover, me, reviewed });
      } catch (e) {
        setData({ loading: false, contest: null });
      }
    })();
  }, [id]);

  const handleShare = async () => {
    const url = `${window.location.origin}/contest/${id}`;
    if (navigator.share) {
      try { await navigator.share({ title: data.contest?.title || 'Razekit contest', url }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', description: 'Contest link copied to clipboard.' });
    } catch {}
  };

  if (data.loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!data.contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;

  const { contest, submissions, handover, me, reviewed } = data;
  const isWinner = me?.id && contest?.winner_user_id === me.id;
  const reviewDirection = isWinner ? 'client' : 'creator';
  const canReview = (canClientReview({ me, contest }) || canWinnerReviewClient({ me, contest })) && !reviewed;
  const handoverLabel = handover
    ? handover.status === 'completed' ? 'Completed' : HANDOVER_STATUS_LABELS[handover.status] || handover.status
    : 'Not required';
  const paymentLabel = contest.status === 'completed' && (!handover || handover.status === 'completed') ? 'Completed' : contest.status.replace('_', ' ');

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto pb-8">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to contest
      </Link>

      <div className="mb-6">
        <AlertState
          type="completed"
          shape="orbs"
          title="Contest completed"
          description={contest.title}
        />
      </div>

      <div className="glass-card rounded-2xl p-5 mb-4 animate-fade-in elev-1">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-0.5">Winner</p>
            <p className="font-heading font-bold leading-tight">Creator #{contest.winner_user_id?.slice(-4)?.toUpperCase()}</p>
            <div className="flex items-center gap-1 text-primary font-heading font-bold nums">
              <IndianRupee className="w-3.5 h-3.5" />{contest.prize_amount?.toLocaleString('en-IN')}
              <span className="text-[10px] font-medium text-muted-foreground font-body ml-1">prize</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="surface rounded-2xl py-2.5 text-center">
            <p className="text-sm font-heading font-bold nums">{submissions.length}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Users className="w-3 h-3" /> Submissions</p>
          </div>
          <div className="surface rounded-2xl py-2.5 text-center">
            <p className="text-sm font-heading font-bold nums">{contest.number_of_winners || 1}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><Trophy className="w-3 h-3" /> Winners</p>
          </div>
        </div>
      </div>

      <div className="surface-2 rounded-2xl p-5 mb-4 elev-1 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Handover</span>
          <span className="font-medium flex items-center gap-1.5">
            {handoverLabel === 'Completed' ? <><Check className="w-4 h-4 text-success" /> Completed</> : handoverLabel}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Payment</span>
          <span className="font-medium flex items-center gap-1.5">
            {paymentLabel === 'Completed' ? <><Check className="w-4 h-4 text-success" /> Completed</> : <span className="capitalize">{paymentLabel}</span>}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <Button asChild className="w-full h-12 text-base font-semibold rounded-full" size="lg">
          <Link to={`/contest/${id}/results`}><Play className="w-4 h-4 mr-2" /> View winning entry</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to={`/contest/${id}/handover/room`}><ArrowLeftRight className="w-4 h-4 mr-2" /> Handover record</Link>
        </Button>
        <Button onClick={handleShare} variant="outline" className="w-full">
          <Share2 className="w-4 h-4 mr-2" /> Share contest
        </Button>
        {canReview && (
          <Button onClick={() => setShowReview(true)} className="w-full">
            <Star className="w-4 h-4 mr-2" /> {isWinner ? 'Review the brand' : 'Review the winner'}
          </Button>
        )}
      </div>

      {showReview && me && contest.winner_user_id && (
        <LeaveReviewModal
          contest={contest}
          direction={reviewDirection}
          creatorId={isWinner ? me.id : contest.winner_user_id}
          clientId={isWinner ? contest.created_by_id : me.id}
          onClose={() => setShowReview(false)}
          onSubmitted={() => setData((d) => ({ ...d, reviewed: true }))}
        />
      )}
    </div>
  );
}