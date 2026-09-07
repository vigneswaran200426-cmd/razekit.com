import { useState } from 'react';
import { X, ArrowUpFromLine, Check, Building2, AlertTriangle, Landmark } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { MIN_WITHDRAWAL, MAX_WITHDRAWAL, calcPaymentBreakdown, generateReferenceNumber, detectFraud } from '@/lib/payment-utils';
import { formatINR } from '@/lib/contest-utils';
import PaymentBreakdown from './PaymentBreakdown';

const SAVED_BANKS = [
  { id: 'bank1', name: 'HDFC Bank', last4: '4521', type: 'Savings' },
  { id: 'bank2', name: 'State Bank of India', last4: '8907', type: 'Savings' },
];

export default function WithdrawModal({ open, onClose, onSuccess, wallet }) {
  const [step, setStep] = useState('details');
  const [amount, setAmount] = useState('');
  const [selectedBank, setSelectedBank] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  if (!open) return null;

  const available = wallet?.available_balance || 0;

  const handleWithdraw = async () => {
    const amt = Number(amount);
    if (!amt || amt < MIN_WITHDRAWAL) { setError(`Minimum withdrawal is ${formatINR(MIN_WITHDRAWAL)}`); return; }
    if (amt > MAX_WITHDRAWAL) { setError(`Maximum withdrawal is ${formatINR(MAX_WITHDRAWAL)}`); return; }
    if (amt > available) { setError('Insufficient wallet balance'); return; }
    if (!selectedBank) { setError('Select a bank account'); return; }

    setLoading(true);
    setError('');
    try {
      const ref = generateReferenceNumber();
      const breakdown = calcPaymentBreakdown(amt, 'withdrawal');

      // Fraud detection
      const existingTxns = await base44.entities.PaymentTransaction.list('-created_date', 50).catch(() => []);
      const fraudAlerts = detectFraud(existingTxns, amt, 'withdrawal');
      for (const alert of fraudAlerts) {
        await base44.entities.FraudAlert.create({
          user_id: wallet?.user_id || '',
          alert_type: alert.type,
          severity: alert.severity,
          status: 'flagged',
          details: alert.details,
        }).catch(() => {});
      }

      // Create withdrawal request
      const withdrawal = await base44.entities.WithdrawalRequest.create({
        user_id: wallet?.user_id || '',
        user_name: '',
        amount: amt,
        bank_account_last4: selectedBank.last4,
        bank_name: selectedBank.name,
        status: 'pending',
        fees: breakdown.totalFees,
        net_amount: breakdown.netAmount,
        requested_at: new Date().toISOString(),
      });

      // Create payment transaction
      const txn = await base44.entities.PaymentTransaction.create({
        user_id: wallet?.user_id || '',
        type: 'withdrawal',
        amount: amt,
        currency: 'INR',
        payment_method: 'bank_transfer',
        stripe_payment_id: `tr_${ref}`,
        status: 'processing',
        fees: breakdown.totalFees,
        net_amount: breakdown.netAmount,
        description: `Withdrawal to ${selectedBank.name} ****${selectedBank.last4}`,
        reference_number: ref,
      });

      // Update wallet
      if (wallet?.id) {
        await base44.entities.Wallet.update(wallet.id, {
          available_balance: available - amt,
          pending_balance: (wallet.pending_balance || 0) + amt,
        });
      }

      // Notification
      await base44.entities.Notification.create({
        type: 'system_announcement',
        title: 'Withdrawal Submitted',
        description: `Withdrawal of ${formatINR(amt)} is being processed. Ref: ${ref}`,
      }).catch(() => {});

      setReceipt({ ...txn, withdrawal, breakdown });
      setStep('success');
    } catch (e) {
      setError('Withdrawal failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('details');
    setAmount('');
    setSelectedBank(null);
    setError('');
    setReceipt(null);
    onClose();
    if (step === 'success') onSuccess?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-t-3xl md:rounded-3xl bg-card border border-border shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {step === 'success' ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-lg font-heading font-bold">Withdrawal Submitted</h3>
            <p className="text-sm text-muted-foreground">
              {formatINR(receipt?.breakdown?.netAmount)} will be transferred to {receipt?.withdrawal?.bank_name} in 1-3 business days.
            </p>
            <div className="bg-secondary/30 rounded-xl px-4 py-2 mt-1">
              <p className="text-xs text-muted-foreground">Reference</p>
              <p className="text-sm font-mono font-semibold">{receipt?.reference_number}</p>
            </div>
            <button onClick={handleClose} className="w-full mt-3 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                  <ArrowUpFromLine className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Withdraw from Wallet</h3>
                  <p className="text-xs text-muted-foreground">Available: {formatINR(available)}</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount (₹)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0" autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-input border border-border text-2xl font-bold focus:outline-none focus:border-primary" />
                <p className="text-xs text-muted-foreground mt-1">Min {formatINR(MIN_WITHDRAWAL)} · Max {formatINR(MAX_WITHDRAWAL)}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Select Bank Account</label>
                <div className="space-y-2">
                  {SAVED_BANKS.map(bank => (
                    <button key={bank.id} onClick={() => setSelectedBank(bank)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${selectedBank?.id === bank.id ? 'border-primary bg-primary/10' : 'border-border bg-input/50 hover:border-border'}`}>
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <Landmark className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{bank.name}</p>
                        <p className="text-xs text-muted-foreground">****{bank.last4} · {bank.type}</p>
                      </div>
                      {selectedBank?.id === bank.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                  <button className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 transition-all">
                    <Building2 className="w-4 h-4" /> Add New Bank Account
                  </button>
                </div>
              </div>

              {amount && Number(amount) > 0 && <PaymentBreakdown amount={amount} type="withdrawal" />}

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <button onClick={handleWithdraw} disabled={loading || !amount}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-all">
                {loading ? <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Processing...</> : <>Withdraw {amount ? formatINR(amount) : 'from Wallet'}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}