import { formatMoney, platformFee, gstOnFee, statutoryDeduction, creatorReceives } from '@/lib/campaign-brief';

const Row = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <span className="text-[11px] font-medium">{value}</span>
  </div>
);

// DISPLAY-ONLY fee breakdown (India · INR). No payment provider is integrated —
// contest funding still uses the existing manual admin "award secured / funded" gate.
export default function FeeBreakdownCard({ data }) {
  const pool = Number(data.prize_amount) || 0;
  const fee = platformFee(pool);
  const gst = gstOnFee(pool);
  const statutory = statutoryDeduction(pool);

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fee Breakdown (India · INR)</p>
      <p className="text-[10px] text-muted-foreground mb-3">Display only — settlement is handled manually by Razekit.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Brand side</p>
          <Row label="Prize pool" value={formatMoney(pool)} />
          <Row label="Razekit platform fee (10%)" value={formatMoney(fee)} />
          <Row label="GST on fee (18%)" value={formatMoney(gst)} />
          <div className="flex justify-between border-t border-border pt-1.5">
            <span className="text-xs font-semibold">Total brand pays</span>
            <span className="text-xs font-bold text-accent">{formatMoney(pool + fee + gst)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Creator side</p>
          <Row label="Gross" value={formatMoney(pool)} />
          <Row label="− Platform fee (10%)" value={`− ${formatMoney(fee)}`} />
          <Row label="− Statutory deduction (TDS)" value={`− ${formatMoney(statutory)}`} />
          <div className="flex justify-between border-t border-border pt-1.5">
            <span className="text-xs font-semibold">You receive</span>
            <span className="text-xs font-bold text-accent">{formatMoney(creatorReceives(pool))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}