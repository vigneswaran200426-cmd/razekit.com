import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, CheckSquare, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import HandoverShell from '@/components/handover/HandoverShell';
import SecurityBanner from '@/components/handover/SecurityBanner';
import { useToast } from '@/components/ui/use-toast';
import { logHandoverEvent } from '@/lib/handover-utils';

const CHECKLIST = [
  'I received the required access — I can access the account or the assets are correct.',
  'The delivered access / files match the contest requirements.',
];

// Winner confirmation screen — sets creator_confirmation on the handover record.
export default function HandoverWinnerConfirm() {
  const { id } = useParams();
  return (
    <HandoverShell contestId={id} active="confirm">
      {(ctx) => <WinnerPanel {...ctx} />}
    </HandoverShell>
  );
}

function WinnerPanel({ handover, user, isWinner, isClient, refresh }) {
  const { toast } = useToast();
  const [checked, setChecked] = useState([false, false]);
  const [busy, setBusy] = useState(false);

  if (!handover?.started_at) {
    return <HintCard text="The handover hasn't been initiated yet. You can confirm access once the brand initiates it." />;
  }

  if (handover.creator_confirmation) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-2xl p-6 text-center">
        <Check className="w-10 h-10 text-success mx-auto mb-2" />
        <p className="font-heading font-semibold mb-1">Access confirmed</p>
        <p className="text-xs text-muted-foreground">
          {handover.creator_confirmed_at ? new Date(handover.creator_confirmed_at).toLocaleString('en-IN') : ''} — now waiting for the brand to confirm and release payment.
        </p>
      </div>
    );
  }

  if (!isWinner) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
        <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">{isClient ? 'Waiting for the winner' : 'Not available'}</p>
        <p className="text-xs text-muted-foreground">
          {isClient ? 'The winner confirms access here once you\'ve granted it.' : 'Only the winning creator can confirm access.'}
        </p>
      </div>
    );
  }

  const allChecked = checked.every(Boolean);

  const confirm = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await base44.entities.Handover.update(handover.id, {
        creator_confirmation: true, creator_confirmed_at: now, status: 'winner_confirmed',
      });
      await logHandoverEvent(handover, { actor: 'creator', actorId: user.id, action: 'winner_confirmed' });
      toast({ title: 'Access confirmed', description: 'The brand can now confirm the handover.' });
      refresh();
    } catch (e) {
      toast({ title: 'Could not confirm', description: 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <SecurityBanner />
      <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-primary" />
          </div>
          <h2 className="font-heading font-bold text-base">Confirm access</h2>
        </div>
        <div className="space-y-3">
          {CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-start gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:border-primary/40 transition-colors">
              <Checkbox
                checked={checked[i]}
                onCheckedChange={(v) => setChecked((prev) => prev.map((c, j) => (j === i ? !!v : c)))}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">{item}</span>
            </label>
          ))}
        </div>
      </div>
      <Button onClick={confirm} disabled={busy || !allChecked} className="w-full h-12 text-base font-semibold" size="lg">
        {busy ? 'Confirming...' : 'Confirm Access'}
      </Button>
      {!allChecked && <p className="text-xs text-muted-foreground text-center">Tick both items to confirm access.</p>}
    </div>
  );
}

function HintCard({ text }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 text-center card-shadow">
      <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}