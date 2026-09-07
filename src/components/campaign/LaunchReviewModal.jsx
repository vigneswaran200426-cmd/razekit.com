import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Rocket } from 'lucide-react';
import { parseJSON, formatMoney, platformFee } from '@/lib/campaign-brief';
import FeeBreakdownCard from '@/components/campaign/FeeBreakdownCard';

const Row = ({ label, value, strong, danger }) => (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className={strong ? (danger ? 'font-bold text-destructive' : 'font-bold text-accent') : 'font-medium'}>{value}</span>
  </div>
);

export default function LaunchReviewModal({ open, onOpenChange, data, funds, onConfirm, publishing }) {
  const pool = Number(data.prize_amount) || 0;
  const total = pool + platformFee(pool);
  const insufficient = funds < total;
  const participation = data.private_contest ? 'Invite-only' : data.verified_creators_only ? 'Verified creators only' : 'Open to all';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Review & Launch</DialogTitle>
          <DialogDescription>Confirm the details — the award amount will be reserved from your wallet balance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 border border-border rounded-xl p-4 bg-card">
          <Row label="Title" value={data.title || '—'} />
          <Row label="Award Pool" value={formatMoney(pool)} />
          <Row label="Winners" value={String(data.number_of_winners || 1)} />
          <Row label="Deadline" value={data.deadline ? new Date(data.deadline).toLocaleString() : '—'} />
          <Row label="Participants" value={participation} />
          <Row label="Deliverables" value={String(parseJSON(data.deliverables).length)} />
          <Row label="Resources" value={String(parseJSON(data.resources).length)} />
          <div className="border-t border-border pt-2 space-y-2">
            <Row label="Platform Fee (10%)" value={formatMoney(platformFee(pool))} />
            <Row label="Total to Reserve" value={formatMoney(total)} strong danger={insufficient} />
            <Row label="Available Balance" value={formatMoney(funds)} danger={insufficient} />
          </div>
        </div>
        <FeeBreakdownCard data={data} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>Cancel</Button>
          <Button className="bg-accent hover:bg-accent/90" onClick={onConfirm} disabled={publishing || insufficient}>
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Launch Contest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}