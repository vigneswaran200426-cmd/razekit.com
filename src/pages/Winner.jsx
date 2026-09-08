import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Trophy, Check, IndianRupee, ArrowLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getHandover, markHandoverCompleted } from '@/lib/handover-utils';
import { useToast } from '@/components/ui/use-toast';
import WorkflowSteps from '@/components/redesign/WorkflowSteps';

const FLOW = [
  { label: 'Review' },
  { label: 'Winner' },
  { label: 'Handover' },
  { label: 'Payment' },
  { label: 'Complete' },
];

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
        setConfirmed(contestData.status === 'completed');
      } catch {
        setContest(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleConfirm = async () => {
    if (confirming || confirmed) return;
    const ok = window.confirm('Release the winner payment and complete this contest? This is a consequential action.');
    if (!ok) return;
    setConfirming(true);
    setBlocked(false);
    try {
      const handover = await getHandover(id).catch(() => null);
      if (handover && !(handover.creator_confirmation && handover.client_confirmation)) {
        setBlocked(true);
        toast({ title: 'Handover still needs confirmation', description: 'Both sides must confirm before payment can be released.', variant: 'destructive' });
        return;
      }

      // Re-read the authoritative contest immediately before the irreversible transition.
      const latest = await base44.entities.Contest.get(id);
      if (!['winner_selected'].includes(latest.status)) {
        setConfirmed(latest.status === 'completed');
        if (latest.status !== 'completed') {
          toast({ title: 'Payment cannot be released yet', description: `Contest is currently ${latest.status}.`, variant: 'destructive' });
        }
        return;
      }

      const now = new Date().toISOString();
      await base44.entities.Contest.update(id, {
        status: 'completed',
        completed_at: now,
        payment_released_at: now,
      });
      if (handover) {
        await markHandoverCompleted(handover, latest.created_by_id).catch(() => {});
      }
      await base44.entities.Notification.create({
        type: 'payment_received',
        title: 'Payment released',
        description: `₹${latest.prize_amount?.toLocaleString('en-IN')} released for the winning creator.`,
        contest_id: id,
        recipient_user_id: latest.winner_user_id,
      }).catch(() => {});
      setConfirmed(true);
      toast({ title: 'Payment released', description: 'Contest completed successfully.' });
    } catch (e) {
      toast({ title: 'Payment release failed', description: e?.message || 'No payment state was confirmed. Please retry after checking the contest.', variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <div className="page-shell grid place-items-center min-h-[55vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" role="status" aria-label="Loading winner" /></div>;
  if (!contest) return <div className="page-shell"><div className="rz-empty"><div><h1 className="font-heading text-xl font-bold">Contest not found</h1><p className="mt-1 text-sm text-muted-foreground">The contest may have been removed or you may not have access to it.</p><Button asChild className="mt-4"><Link to="/explore">Back to Explore</Link></Button></div></div></div>;

  const currentStep = confirmed ? 4 : blocked ? 2 : 1;
  const prize = Number(contest.prize_amount || 0);

  return (
    <div className="page-shell pb-10">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground press"><ArrowLeft className="w-4 h-4" /> Back to contest</Link>
        <WorkflowSteps steps={FLOW} current={currentStep} />

        <section className="surface-2 p-6 md:p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-primary/10 text-primary"><Trophy className="h-7 w-7" /></div>
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Winner selected</p>
          <h1 className="mt-1 font-heading text-2xl md:text-3xl font-bold tracking-tight">{contest.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Final approval, handover and payment status for this contest.</p>

          <div className="mt-6 grid sm:grid-cols-2 gap-3 text-left">
            <div className="surface p-4"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Winning creator</p><p className="mt-1 font-semibold">Creator #{contest.winner_user_id?.slice(-4)?.toUpperCase() || '—'}</p></div>
            <div className="surface p-4"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Prize</p><p className="mt-1 flex items-center gap-1 font-heading font-bold text-xl text-primary"><IndianRupee className="w-5 h-5" />{prize.toLocaleString('en-IN')}</p></div>
          </div>
        </section>

        {confirmed ? (
          <section className="surface border-success/30 p-6 text-center">
            <Check className="w-8 h-8 text-success mx-auto mb-2" />
            <p className="font-heading font-semibold">Payment released and contest completed</p>
            <p className="mt-1 text-sm text-muted-foreground">The final state has been recorded. No further payment action is required.</p>
            <div className="mt-5 grid sm:grid-cols-2 gap-2"><Button asChild className="rz-primary-action"><Link to={`/contest/${id}/completed`}>View completion</Link></Button><Button asChild variant="outline" className="rz-secondary-action"><Link to={`/contest/${id}/handover`}>View handover</Link></Button></div>
          </section>
        ) : blocked ? (
          <section className="surface border-amber-500/30 p-6">
            <p className="font-heading font-semibold">Handover confirmation required</p>
            <p className="mt-1 text-sm text-muted-foreground">Payment is blocked until both the winning creator and client confirm the handover state.</p>
            <Button asChild className="rz-primary-action mt-4 w-full"><Link to={`/contest/${id}/handover`}>Open handover</Link></Button>
          </section>
        ) : (
          <section className="surface p-6">
            <p className="font-heading font-semibold">Ready for final payment release</p>
            <p className="mt-1 text-sm text-muted-foreground">Confirming will complete the contest after the authoritative backend state is re-checked.</p>
            <Button onClick={handleConfirm} disabled={confirming} className="rz-primary-action mt-5 w-full h-12 text-base font-semibold">{confirming ? 'Checking & releasing…' : 'Confirm & release payment'}</Button>
            <p className="mt-3 text-xs text-muted-foreground text-center">This action is consequential and should only be taken after the handover is complete.</p>
          </section>
        )}
      </div>
    </div>
  );
}
