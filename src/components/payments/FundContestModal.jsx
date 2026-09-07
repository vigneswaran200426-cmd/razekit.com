import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import PaymentSummary from '@/components/payments/PaymentSummary';
import { formatMoneyMinor } from '@/lib/money';

// Brand checkout for contest prize funding. The server computes every amount,
// the server verifies every confirmation — this UI only renders and forwards.
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function FundContestModal({ contest, open, onClose, onFunded }) {
  const [quote, setQuote] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [payError, setPayError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const idempotencyRef = useRef(null);

  useEffect(() => {
    if (!open || quote || loadError) return;
    (async () => {
      try {
        const res = await base44.functions.invoke('paymentQuote', { contest_id: contest.id });
        const data = res.data || {};
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setQuote(data);
      } catch (e) {
        setLoadError({ message: (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || 'Could not load the payment summary. Try again.' });
      }
    })();
  }, [open, contest.id]);

  const confirmPayment = async (payload) => {
    const res = await base44.functions.invoke('paymentConfirm', payload);
    const data = res.data || {};
    if (data.status === 'CAPTURED') {
      setDone(true);
      setPaying(false);
      if (onFunded) onFunded();
    } else {
      setPayError({ message: 'Payment is still processing — it will be confirmed automatically.' });
      setPaying(false);
    }
  };

  const handlePay = async () => {
    if (!quote || paying) return;
    setPaying(true);
    setPayError(null);
    // Server-side idempotency key — a retry reuses the same key, so a double
    // click or reopened window can never produce a second charge.
    if (!idempotencyRef.current) {
      idempotencyRef.current = `fund-${contest.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    try {
      const res = await base44.functions.invoke('paymentCreate', {
        quote_id: quote.quote_id,
        idempotency_key: idempotencyRef.current,
        origin: window.location.origin,
      });
      const data = res.data || {};
      if (data.error) {
        setPayError(data.error);
        setPaying(false);
        return;
      }
      if (data.provider === 'stripe') {
        sessionStorage.setItem(`razekit-payref-${contest.id}`, data.reference);
        window.location.href = data.redirect_url;
        return;
      }
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setPayError({ message: 'Could not open the payment window. Check your connection and try again.' });
        setPaying(false);
        return;
      }
      const checkout = new window.Razorpay({
        key: data.key_id,
        order_id: data.order_id,
        amount: data.amount_minor,
        currency: data.currency,
        name: 'Razekit',
        description: `Prize funding — ${contest.title}`,
        theme: { color: '#1A7BF8' },
        handler: (resp) => {
          confirmPayment({ payment_id: data.payment_id, razorpay: resp }).catch((e) => {
            setPayError({ message: (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || "Payment couldn't be confirmed. We will verify it automatically." });
            setPaying(false);
          });
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      checkout.open();
    } catch (e) {
      const err = (e.response && e.response.data && e.response.data.error) || {};
      setPayError({ code: err.code, message: err.message || "Payment couldn't be initiated. Try again." });
      setPaying(false);
    }
  };

  const retryQuote = () => {
    setQuote(null);
    setLoadError(null);
    setPayError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <ShieldCheck className="h-6 w-6 text-success" />
            </div>
            <h3 className="text-base font-semibold font-heading">Contest funded</h3>
            <p className="mt-1 text-sm text-muted-foreground">Payment confirmed and the prize is reserved. Your contest is live.</p>
            <Button className="mt-5" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Fund contest</DialogTitle>
              <DialogDescription>
                Prize funding for “{contest.title}”{quote ? ` — all amounts in ${quote.currency}.` : '.'}
              </DialogDescription>
            </DialogHeader>

            {!quote && !loadError && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}

            {loadError && (
              <div className="py-4">
                <div className="rounded-xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm">
                  {loadError.code === 'ALREADY_FUNDED'
                    ? 'This contest is already funded — no further payment is needed.'
                    : loadError.message}
                </div>
                {loadError.code !== 'ALREADY_FUNDED' && (
                  <Button className="mt-3 w-full" variant="outline" onClick={retryQuote}>Try again</Button>
                )}
              </div>
            )}

            {quote && (
              <>
                <PaymentSummary quote={quote} />
                {payError && (
                  <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {payError.code === 'PROVIDER_UNAVAILABLE'
                      ? "Payment is unavailable right now. Razekit's payment setup for this market is being completed — try again soon."
                      : payError.message}
                  </div>
                )}
                <Button className="mt-4 w-full" size="lg" disabled={paying || Boolean(loadError)} onClick={handlePay}>
                  {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {paying ? 'Preparing payment…' : `Pay ${formatMoneyMinor(quote.totalMinor, quote.currency)}`}
                </Button>
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Payments are confirmed by the payment provider — retrying never charges twice.
                </p>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}