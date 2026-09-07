import { formatMoneyMinor } from '@/lib/money';

// Server-computed checkout summary. Every value comes from the backend quote —
// the frontend renders, never calculates. One currency per checkout.
export default function PaymentSummary({ quote }) {
  if (!quote) return null;
  const rows = [
    { label: 'Prize', amountMinor: quote.subtotalMinor },
    { label: 'Platform fee', amountMinor: quote.platformFeeMinor },
    { label: 'Processing fee', amountMinor: quote.processingFeeMinor },
    { label: 'Tax', amountMinor: quote.taxMinor },
  ];
  return (
    <div className="rounded-xl border border-border/70 bg-white/60 divide-y divide-border/60">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm text-muted-foreground">{row.label}</span>
          <span className="text-sm font-semibold">{formatMoneyMinor(row.amountMinor, quote.currency)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-3 bg-secondary/50">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-base font-bold text-primary">{formatMoneyMinor(quote.totalMinor, quote.currency)}</span>
      </div>
    </div>
  );
}