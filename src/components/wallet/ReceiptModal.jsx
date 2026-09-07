import { X, Download, Mail, IndianRupee, Check, Clock } from 'lucide-react';
import { formatINR } from '@/lib/contest-utils';
import { calcPaymentBreakdown } from '@/lib/payment-utils';

export default function ReceiptModal({ transaction, onClose }) {
  if (!transaction) return null;

  const breakdown = calcPaymentBreakdown(transaction.amount, transaction.type);
  const isSuccess = transaction.status === 'completed';

  const handleDownloadPDF = () => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      const left = 20;
      let y = 30;

      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Receipt', left, y);
      y += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.text('CreatorContest Platform', left, y);
      y += 15;

      doc.setDrawColor(230);
      doc.line(left, y, 190, y);
      y += 10;

      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.text(`Reference: ${transaction.reference_number || '—'}`, left, y); y += 7;
      doc.text(`Date: ${new Date(transaction.created_date).toLocaleString('en-IN')}`, left, y); y += 7;
      doc.text(`Status: ${transaction.status?.toUpperCase()}`, left, y); y += 7;
      doc.text(`Method: ${transaction.payment_method || '—'}`, left, y); y += 12;

      doc.line(left, y, 190, y); y += 10;
      doc.setFont('helvetica', 'bold');
      doc.text('Breakdown', left, y); y += 8;
      doc.setFont('helvetica', 'normal');
      doc.text(`Amount: ${formatINR(transaction.amount)}`, left, y); y += 7;
      doc.text(`Processing Fee: ${formatINR(breakdown.processingFee)}`, left, y); y += 7;
      doc.text(`Taxes (18% GST): ${formatINR(breakdown.taxes)}`, left, y); y += 7;

      const netLabel = transaction.type === 'withdrawal' ? 'Net Amount' : 'Total Paid';
      const netValue = transaction.type === 'withdrawal' ? breakdown.netAmount : breakdown.clientTotal;
      doc.setFont('helvetica', 'bold');
      doc.text(`${netLabel}: ${formatINR(netValue)}`, left, y); y += 15;

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text('This is a system-generated receipt. For queries, contact support.', left, y);

      doc.save(`receipt-${transaction.reference_number || transaction.id}.pdf`);
    });
  };

  const handleEmailCopy = async () => {
    try {
      const { base44 } = await import('@/api/base44Client');
      const me = await base44.auth.me();
      await base44.integrations.Core.SendEmail({
        to: me.email,
        subject: `Receipt · ${transaction.reference_number || ''}`,
        body: `Your receipt for ${formatINR(transaction.amount)} (${transaction.type})\n\nReference: ${transaction.reference_number}\nDate: ${new Date(transaction.created_date).toLocaleString('en-IN')}\nStatus: ${transaction.status}\n\nThank you for using CreatorContest.`,
      });
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold">Receipt</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-col items-center text-center mb-5 pb-5 border-b border-border">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${isSuccess ? 'bg-success/15' : 'bg-amber-400/10'}`}>
              {isSuccess ? <Check className="w-7 h-7 text-success" /> : <Clock className="w-7 h-7 text-amber-400" />}
            </div>
            <p className="text-2xl font-heading font-bold flex items-center">
              <IndianRupee className="w-5 h-5" />{transaction.amount.toLocaleString('en-IN')}
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-2 ${isSuccess ? 'bg-success/10 text-success' : 'bg-amber-400/10 text-amber-400'}`}>
              {transaction.status}
            </span>
          </div>

          <div className="space-y-2.5 mb-5">
            {[
              ['Reference', transaction.reference_number],
              ['Type', transaction.type],
              ['Method', transaction.payment_method],
              ['Date', new Date(transaction.created_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
              ['Processing Fee', formatINR(breakdown.processingFee)],
              ['Taxes', formatINR(breakdown.taxes)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium font-mono">{value || '—'}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
              <span className="font-semibold">{transaction.type === 'withdrawal' ? 'Net Amount' : 'Total'}</span>
              <span className="font-heading font-bold text-primary flex items-center">
                <IndianRupee className="w-4 h-4" />
                {(transaction.type === 'withdrawal' ? breakdown.netAmount : breakdown.clientTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              <Download className="w-4 h-4" /> PDF
            </button>
            <button onClick={handleEmailCopy}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors">
              <Mail className="w-4 h-4" /> Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}