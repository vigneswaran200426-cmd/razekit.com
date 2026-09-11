// Pay a contest's funding by UPI, through UroPay.
//
// The one thing this component must never do is tell a brand their contest is
// funded because the browser thinks so. Every status shown here came from the
// server asking the provider directly — closing the UPI app, refreshing, or
// typing a reference number changes nothing on its own.
//
// It is also honest about test mode. A payment made against test credentials
// moves no money and funds no contest, and saying that plainly is better than
// letting someone discover it after they think they have paid.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Copy, Check, Loader2, Smartphone } from 'lucide-react';
import { fn } from '@/lib/api';
import { moneyMinor } from '@/lib/format';
import { Button, Card, Input, Label, Badge } from '@/components/ui';

const msgOf = (e, fallback) => e?.data?.error?.message || e?.message || fallback;

/** How often we ask the server to re-check with the provider, in ms. */
const POLL_MS = 5000;
/** Stop polling after this long so a forgotten tab does not poll forever. */
const POLL_CEILING_MS = 10 * 60 * 1000;

export default function UpiPayment({ fundingId, totalMinor, currency = 'INR', onFunded }) {
  const [availability, setAvailability] = useState(null);
  const [order, setOrder] = useState(null);
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [utr, setUtr] = useState('');
  const [copied, setCopied] = useState(false);
  const startedAt = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    fn('uropayAvailability')
      .then((a) => { if (alive) setAvailability(a); })
      .catch(() => { if (alive) setAvailability({ available: false }); });
    return () => { alive = false; };
  }, []);

  const check = useCallback(async (orderId) => {
    try {
      const res = await fn('uropayOrderStatus', { provider_order_id: orderId });
      setState(res.state);
      setMessage(res.message || '');
      if (res.credited) {
        window.clearInterval(timer.current);
        onFunded?.();
      }
      return res;
    } catch (e) {
      // A failed check is a failed check — it is not evidence of anything about
      // the payment, so the state is left alone rather than guessed at.
      setError(msgOf(e, 'We could not check that payment just now.'));
      return null;
    }
  }, [onFunded]);

  // Poll while an order is open. Cleared on unmount so a navigated-away page
  // does not keep hitting the provider.
  useEffect(() => {
    if (!order?.provider_order_id) return undefined;
    startedAt.current = Date.now();
    timer.current = window.setInterval(() => {
      if (Date.now() - startedAt.current > POLL_CEILING_MS) {
        window.clearInterval(timer.current);
        return;
      }
      check(order.provider_order_id);
    }, POLL_MS);
    return () => window.clearInterval(timer.current);
  }, [order?.provider_order_id, check]);

  const start = async () => {
    setBusy(true); setError('');
    try {
      const res = await fn('uropayCreateOrder', { funding_id: fundingId });
      setOrder(res);
      setState(res.state);
    } catch (e) {
      setError(msgOf(e, 'The UPI payment could not be started. Nothing was charged.'));
    } finally {
      setBusy(false);
    }
  };

  const sendUtr = async () => {
    setBusy(true); setError('');
    try {
      const res = await fn('uropaySubmitUtr', {
        provider_order_id: order.provider_order_id,
        reference_number: utr.trim(),
      });
      setState(res.state);
      setMessage(res.message || '');
      if (res.credited) onFunded?.();
    } catch (e) {
      setError(msgOf(e, 'That reference could not be submitted.'));
    } finally {
      setBusy(false);
    }
  };

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(order.upi_string); setCopied(true); } catch { /* clipboard blocked */ }
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (availability === null) return null;
  if (!availability.available) return null;

  const paid = state === 'PAID';
  const failed = state === 'FAILED' || state === 'EXPIRED' || state === 'CANCELLED';

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
            Pay by UPI
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {moneyMinor(totalMinor, currency)} — pay from any UPI app.
          </p>
        </div>
        {/* Test mode is disclosed up front, not discovered afterwards. */}
        {!availability.live && (
          <Badge tone="warning">Test mode</Badge>
        )}
      </div>

      {!availability.live && (
        <p className="mt-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] leading-relaxed text-ink">
          UPI payment is running in test mode. No real money moves and no contest will be funded from a
          test payment. Use bank transfer to fund a contest for real.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {!order && (
        <Button onClick={start} disabled={busy} className="mt-4 w-full sm:w-auto">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Starting…' : 'Start UPI payment'}
        </Button>
      )}

      {order && (
        <div className="mt-4 space-y-4">
          {order.qr_code && !paid && !failed && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-2 p-4">
              <img
                src={order.qr_code}
                alt={`UPI QR code for ${moneyMinor(totalMinor, currency)}`}
                className="h-44 w-44 rounded-md bg-white p-2"
              />
              <p className="text-center text-[12px] leading-relaxed text-muted">
                Scan with any UPI app, or copy the payment link below.
              </p>
              {order.upi_string && (
                <button
                  type="button"
                  onClick={copyUpi}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {copied
                    ? <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? 'Link copied' : 'Copy UPI link'}
                </button>
              )}
            </div>
          )}

          {/* One status line, sourced from the server. role=status so a screen
              reader hears the change without the focus being stolen. */}
          <p
            role="status"
            aria-live="polite"
            className={[
              'flex items-start gap-2 rounded-md px-3 py-2 text-[13px] leading-relaxed',
              paid ? 'border border-success/30 bg-success/5 text-ink'
                : failed ? 'border border-danger/30 bg-danger/5 text-ink'
                  : 'border border-line bg-surface-2 text-muted',
            ].join(' ')}
          >
            {paid ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              : failed ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                : <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            {message || 'Waiting for the payment to be confirmed.'}
          </p>

          {!paid && !failed && (
            <div className="rounded-lg border border-line p-3">
              <Label htmlFor="utr">Already paid? Enter your UPI reference number</Label>
              <p className="mb-2 mt-0.5 text-[12px] leading-relaxed text-muted">
                Your payment app shows this after a transfer. It helps the provider match your payment —
                it does not confirm it by itself.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="utr"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder="e.g. 402312345678"
                  inputMode="numeric"
                  autoComplete="off"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={sendUtr}
                  disabled={busy || utr.trim().length < 6}
                  className="min-h-[44px]"
                >
                  Submit reference
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
