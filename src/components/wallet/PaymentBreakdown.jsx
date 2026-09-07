import { IndianRupee, Shield } from 'lucide-react';
import { calcPaymentBreakdown } from '@/lib/payment-utils';

export default function PaymentBreakdown({ amount, type = 'deposit' }) {
  const breakdown = calcPaymentBreakdown(amount, type);

  const rows = type === 'withdrawal'
    ? [
        { label: 'Withdrawal Amount', value: breakdown.amount, bold: true },
        { label: 'Processing Fee', value: -breakdown.processingFee, muted: true },
        { label: 'Taxes (18% GST)', value: -breakdown.taxes, muted: true },
        { label: 'You Receive', value: breakdown.netAmount, highlight: true },
      ]
    : [
        { label: 'Amount', value: breakdown.amount, bold: true },
        { label: 'Processing Fee', value: breakdown.processingFee, muted: true },
        { label: 'Taxes (18% GST)', value: breakdown.taxes, muted: true },
        { label: 'Total Payable', value: breakdown.clientTotal, highlight: true },
      ];

  return (
    <div className="bg-secondary/30 border border-border rounded-xl p-4 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Shield className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Breakdown</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className={`flex items-center justify-between ${row.highlight ? 'pt-2 border-t border-border' : ''}`}>
          <span className={`text-sm ${row.highlight ? 'font-semibold' : row.muted ? 'text-muted-foreground' : 'font-medium'}`}>
            {row.label}
          </span>
          <span className={`flex items-center text-sm ${row.highlight ? 'font-heading font-bold text-primary' : row.bold ? 'font-semibold' : 'text-muted-foreground'}`}>
            <IndianRupee className="w-3 h-3" />
            {Math.abs(row.value).toLocaleString('en-IN', { minimumFractionDigits: row.muted ? 2 : 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
}