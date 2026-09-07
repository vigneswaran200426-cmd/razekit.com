import { useState } from 'react';
import { X, ArrowRight, Check, Lock, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { MIN_DEPOSIT, MAX_DEPOSIT, generateReferenceNumber, validateCard, detectFraud } from '@/lib/payment-utils';
import { formatINR } from '@/lib/contest-utils';
import PaymentBreakdown from './PaymentBreakdown';
import CardForm from './CardForm';

export default function AddFundsModal({ open, onClose, onSuccess, wallet }) {
  const [step, setStep] = useState('amount');
  const [amount, setAmount] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  if (!open) return null;

  const quickAmounts = [500, 1000, 2000, 5000, 10000];

  const handleContinue = () => {
    const amt = Number(amount);
    if (!amt || amt < MIN_DEPOSIT) { setError(`Minimum deposit is ${formatINR(MIN_DEPOSIT)}`); return; }
    if (amt > MAX_DEPOSIT) { setError(`Maximum deposit is ${formatINR(MAX_DEPOSIT)}`); return; }
    setError('');
    setStep('payment');
  };

  const handlePay = async () => {
    const cardErrors = validateCard(card);
    if (Object.keys(cardErrors).length > 0) { setError('Please enter valid card details'); return; }

    setLoading(true);
    setError('');
    try {
      const amt = Number(amount);
      const ref = generateReferenceNumber();
      const breakdown = await import('@/lib/payment-utils').then(m => m.calcPaymentBreakdown(amt, 'deposit'));

      // Fraud detection
      const existingTxns = await base44.entities.PaymentTransaction.list('-created_date', 50).catch(() => []);
      const fraudAlerts = detectFraud(existingTxns, amt, 'deposit');
      for (const alert of fraudAlerts) {
        await base44.entities.FraudAlert.create({
          user_id: wallet?.user_id || '',
          alert_type: alert.type,
          severity: alert.severity,
          status: 'flagged',
          details: alert.details,
        }).catch(() => {});
      }

      // Create payment transaction
      const txn = await base44.entities.PaymentTransaction.create({
        user_id: wallet?.user_id || '',
        type: 'deposit',
        amount: amt,
        currency: 'INR',
        payment_method: 'card',
        stripe_payment_id: `pm_${ref}`,
        status: 'completed',
        fees: breakdown.processingFee,
        taxes: breakdown.taxes,
        net_amount: amt,
        description: 'Wallet top-up via card',
        reference_number: ref,
      });

      // Backward-compatible FundsTransaction
      await base44.entities.FundsTransaction.create({
        type: 'add',
        amount: amt,
        description: `Deposit · ${ref}`,
      }).catch(() => {});

      // Update wallet
      if (wallet?.id) {
        await base44.entities.Wallet.update(wallet.id, {
          available_balance: (wallet.available_balance || 0) + amt,
          total_deposits: (wallet.total_deposits || 0) + amt,
        });
      }

      // Notification
      await base44.entities.Notification.create({
        type: 'payment_received',
        title: 'Wallet Funded',
        description: `${formatINR(amt)} has been added to your wallet. Ref: ${ref}`,
      }).catch(() => {});

      setReceipt({ ...txn, breakdown });
      setStep('success');
    } catch (e) {
      setError('Payment verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('amount');
    setAmount('');
    setCard({ number: '', expiry: '', cvc: '' });
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
            <h3 className="text-lg font-heading font-bold">Wallet Funded!</h3>
            <p className="text-sm text-muted-foreground">{formatINR(amount)} has been added to your wallet.</p>
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
                  <ArrowRight className="w-4 h-4 text-primary" style={{ width: 18, height: 18 }} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Add to Wallet</h3>
                  <p className="text-xs text-muted-foreground">{step === 'amount' ? 'Enter amount' : 'Secure payment'}</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {step === 'amount' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount (₹)</label>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0" autoFocus
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border text-2xl font-bold focus:outline-none focus:border-primary" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts.map(amt => (
                      <button key={amt} onClick={() => setAmount(String(amt))}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent border border-border hover:border-primary/40 transition-all">
                        +{formatINR(amt)}
                      </button>
                    ))}
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <button onClick={handleContinue} disabled={!amount || Number(amount) <= 0}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-all">
                    Continue <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {step === 'payment' && (
                <>
                  <PaymentBreakdown amount={amount} type="deposit" />
                  <CardForm card={card} setCard={setCard} />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setStep('amount')} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent transition-colors">
                      Back
                    </button>
                    <button onClick={handlePay} disabled={loading}
                      className="flex-[2] py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-all">
                      {loading ? <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Processing...</> : <><Lock className="w-4 h-4" /> Pay {formatINR(amount)}</>}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3 h-3" /> 256-bit encrypted · Powered by Stripe
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}