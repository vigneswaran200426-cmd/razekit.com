import { useEffect, useState } from 'react';
import { IndianRupee, Lock, Trophy, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { formatMoney, formatMoneyMinor } from '@/lib/money';
import FundContestModal from '@/components/payments/FundContestModal';
import { Button } from '@/components/ui/button';

const PAYOUT_LABELS = {
  NOT_ELIGIBLE: 'Not eligible',
  PENDING_PAYMENT: 'Awaiting funding',
  PAYMENT_RESERVED: 'Prize reserved',
  READY_FOR_PAYOUT: 'Ready to pay',
  PAYOUT_INITIATED: 'Processing',
  PAYOUT_PROCESSING: 'Processing',
  PAYOUT_COMPLETED: 'Paid',
  PAYOUT_FAILED: 'Failed',
  PAYOUT_REVERSED: 'Reversed',
  ON_HOLD: 'Action required',
  RECONCILIATION_REQUIRED: 'Under review',
};

const Row = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5" />}{label}
    </span>
    <span className={`text-xs font-semibold ${tone || ''}`}>{value}</span>
  </div>
);

// Contest Financials — powered by the money engine (Payment + Payout records,
// all amounts in the contest's locked currency). The funding CTA routes
// through the server-computed quote; nothing here charges or moves money.
export default function ContestFinancialsPanel({ contest }) {
  const { user } = useAuth();
  const [payments, setPayments] = useState(null);
  const [payout, setPayout] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const currency = contest.currency || 'INR';

  const refresh = async () => {
    const [paymentList, payoutList] = await Promise.all([
      base44.entities.Payment.filter({ contest_id: contest.id }, '-created_date', 10).catch(() => []),
      base44.entities.Payout.filter({ contest_id: contest.id }, '-created_date', 5).catch(() => []),
    ]);
    setPayments(paymentList);
    setPayout(payoutList[0] || null);
  };

  useEffect(() => {
    refresh();
    // Stripe checkout redirects back with ?payment=success&session_id=… —
    // confirm server-side; the redirect alone is never treated as truth.
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (params.get('payment') === 'success' && sessionId) {
      const ref = sessionStorage.getItem(`razekit-payref-${contest.id}`);
      if (ref) {
        sessionStorage.removeItem(`razekit-payref-${contest.id}`);
        base44.functions.invoke('paymentConfirm', { reference: ref, stripe: { session_id: sessionId } }).catch(() => null);
      }
    }
     
  }, [contest.id]);

  const captured = (payments || []).find((p) => p.status === 'CAPTURED');
  const pendingPayment = (payments || []).find((p) => ['PENDING', 'AUTHORIZED'].includes(p.status));
  const isOwner = Boolean(user && contest.created_by_id === user.id);
  const needsFunding = isOwner && !captured && ['draft', 'paused'].includes(contest.status);

  const paymentStatus = captured ? 'Funded' : pendingPayment ? 'Processing' : 'Not funded';
  const payoutLabel = contest.winner_user_id
    ? payout
      ? PAYOUT_LABELS[payout.status] || payout.status
      : 'Pending'
    : '—';

  return (
    <div className="bg-card border border-border rounded-xl p-4 mt-3 mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Contest Financials ({currency})</h3>
      <p className="text-[10px] text-muted-foreground mb-2">
        Prize funding and winner payouts are processed by the Razekit money engine.
      </p>
      <div className="divide-y divide-border/60">
        <Row icon={Wallet} label="Payment status" value={paymentStatus} tone={captured ? 'text-success' : pendingPayment ? 'text-amber-600' : ''} />
        <Row icon={IndianRupee} label="Prize pool" value={formatMoney(contest.prize_amount, currency)} />
        <Row icon={IndianRupee} label="Platform fee" value={captured ? formatMoneyMinor(captured.platform_fee_minor, currency) : 'Calculated at checkout'} />
        <Row icon={Lock} label="Prize status" value={captured ? 'Reserved for the winner' : 'Not reserved'} tone={captured ? 'text-success' : ''} />
        <Row icon={Trophy} label="Winner payout status" value={payoutLabel} tone={payout && payout.status === 'PAYOUT_COMPLETED' ? 'text-success' : ''} />
      </div>
      {needsFunding && (
        <Button className="mt-3 w-full" onClick={() => setModalOpen(true)}>
          Fund contest
        </Button>
      )}
      <FundContestModal
        contest={contest}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onFunded={refresh}
      />
    </div>
  );
}