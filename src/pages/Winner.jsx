import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Trophy, Check, IndianRupee, ArrowLeft, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getHandover, markHandoverCompleted } from '@/lib/handover-utils';
import { useToast } from '@/components/ui/use-toast';

export default function Winner() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const contestData = await base44.entities.Contest.get(id);
        setContest(contestData);
        if (contestData.status === 'completed') setConfirmed(true);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      // Payment is released only after the account handover is confirmed by BOTH sides.
      const handover = await getHandover(id).catch(() => null);
      if (handover && !(handover.creator_confirmation && handover.client_confirmation)) {
        setBlocked(true);
        return;
      }
      await base44.entities.Contest.update(id, { status: 'completed' });
      if (handover) {
        await markHandoverCompleted(handover, contest.created_by_id).catch(() => {});
      }
      await base44.entities.Notification.create({
        type: 'payment_received',
        title: 'Payment Sent',
        description: `₹${contest.prize_amount?.toLocaleString('en-IN')} transferred to winner`,
        contest_id: id,
      });
      setConfirmed(true);
      toast({ title: 'Payment Released', description: 'Contest completed successfully.' });
    } catch (e) {} finally { setConfirming(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto pb-8">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-10 h-10 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-1">Winner selected</h1>
        <p className="text-sm text-muted-foreground mb-6">{contest.title}</p>

        <div className="glass-card rounded-2xl p-6 mb-6 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <p className="font-heading font-bold text-lg mb-0.5">Creator #{contest.winner_user_id?.slice(-4)?.toUpperCase()}</p>
          <p className="text-xs text-muted-foreground mb-4">Winning creator of this contest</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Prize</p>
          <div className="flex items-center justify-center gap-1 text-primary font-heading font-bold text-2xl">
            <IndianRupee className="w-6 h-6" />{contest.prize_amount?.toLocaleString('en-IN')}
          </div>
        </div>

        {confirmed ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-success font-medium">
              <Check className="w-5 h-5" /> Payment transferred
            </div>
            <p className="text-sm text-muted-foreground">Contest completed successfully</p>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/contest/${id}/completed`}>View summary</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/">Home</Link>
            </Button>
          </div>
        ) : blocked ? (
          <div className="glass-card rounded-2xl p-5 text-left animate-fade-in">
            <p className="font-heading font-semibold mb-1">Handover required</p>
            <p className="text-sm text-muted-foreground mb-4">
              Payment releases only after both you and the winner confirm the handover.
            </p>
            <Button asChild className="w-full"><Link to={`/contest/${id}/handover`}>Open handover</Link></Button>
          </div>
        ) : (
          <>
            <Button onClick={handleConfirm} disabled={confirming} className="w-full" size="lg">
              {confirming ? 'Confirming…' : 'Confirm & transfer payment'}
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Payment unlocks after the account handover is confirmed by both sides.
            </p>
          </>
        )}
      </div>
    </div>
  );
}