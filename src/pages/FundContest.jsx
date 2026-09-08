import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, CheckCircle2, Lock } from 'lucide-react';
import { fn, entities } from '@/lib/api';
import { moneyMinor } from '@/lib/format';
import { Card, Button, Spinner } from '@/components/ui';

function loadRazorpay() {
  return new Promise((res) => {
    if (window.Razorpay) return res(true);
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => res(true); s.onerror = () => res(false); document.body.appendChild(s);
  });
}

export default function FundContest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [payErr, setPayErr] = useState('');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const idem = useRef(null);

  useEffect(() => { entities.Contest.get(id).then(setContest).catch(() => {}); }, [id]);
  useEffect(() => {
    fn('paymentQuote', { contest_id: id })
      .then((d) => { if (d?.error) setLoadErr(d.error.message || 'Could not load the payment summary.'); else setQuote(d); })
      .catch((e) => setLoadErr(e?.data?.error?.code === 'ALREADY_FUNDED' ? 'This contest is already funded.' : (e.message || 'Could not load the payment summary.')));
  }, [id]);

  const pay = async () => {
    if (!quote) return;
    setPaying(true); setPayErr('');
    if (!idem.current) idem.current = `fund-${id}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const data = await fn('paymentCreate', { quote_id: quote.quote_id, idempotency_key: idem.current, origin: window.location.origin });
      if (data.provider === 'stripe' && data.redirect_url) { window.location.href = data.redirect_url; return; }
      if (data.provider === 'razorpay') {
        const ok = await loadRazorpay();
        if (!ok) { setPayErr('Could not open the payment window.'); setPaying(false); return; }
        const rz = new window.Razorpay({
          key: data.key_id, order_id: data.order_id, amount: data.amount_minor, currency: data.currency, name: 'RazeKit', description: `Prize funding — ${contest?.title}`,
          handler: async (resp) => { try { const c = await fn('paymentConfirm', { payment_id: data.payment_id, razorpay: resp }); if (c.status === 'CAPTURED') setDone(true); else setPayErr('Payment is processing — it will confirm automatically.'); } catch { setPayErr('Could not confirm payment.'); } setPaying(false); },
          modal: { ondismiss: () => setPaying(false) },
        });
        rz.open();
        return;
      }
      setPayErr('Payment could not be started.'); setPaying(false);
    } catch (e) {
      const code = e?.data?.error?.code;
      setPayErr(code === 'PROVIDER_UNAVAILABLE' ? 'Payments aren’t enabled for this market yet — the RazeKit payment provider is still being connected. Your contest is saved.' : (e.message || 'Payment could not be started.'));
      setPaying(false);
    }
  };

  if (done) return (
    <div className="max-w-md mx-auto text-center py-16"><CheckCircle2 className="w-14 h-14 text-success mx-auto" />
      <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">Contest funded</h1>
      <p className="mt-2 text-muted">The prize is held securely and your contest is live.</p>
      <Button className="mt-6" onClick={() => navigate(`/contest/${id}`)}>View contest</Button></div>
  );

  const row = (label, minor, strong) => (
    <div className={`flex items-center justify-between ${strong ? 'text-ink font-semibold' : 'text-muted'}`}><span className="text-sm">{label}</span><span className="text-sm nums">{moneyMinor(minor, quote?.currency)}</span></div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="w-4 h-4" /> Contest</Link>
      <div><p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Fund contest</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">{contest?.title || 'Prize funding'}</h1></div>

      <Card className="p-6">
        {loadErr ? <p className="text-sm text-danger">{loadErr}</p>
          : !quote ? <div className="py-8 grid place-items-center"><Spinner /></div>
          : (
            <div className="space-y-3">
              {row('Prize pool', quote.subtotalMinor)}
              {row('Platform fee', quote.platformFeeMinor)}
              {quote.processingFeeMinor > 0 && row('Processing fee', quote.processingFeeMinor)}
              {quote.taxMinor > 0 && row('Tax (GST)', quote.taxMinor)}
              <div className="h-px bg-line my-1" />
              {row('Total payable', quote.totalMinor, true)}
              {payErr && <div className="rounded-md bg-warning/10 text-[#8a5300] text-sm px-3 py-2 mt-2">{payErr}</div>}
              <Button size="lg" className="w-full mt-3" loading={paying} onClick={pay}><Lock className="w-4 h-4" /> Pay {moneyMinor(quote.totalMinor, quote.currency)}</Button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><ShieldCheck className="w-3.5 h-3.5 text-success" /> Prize held in escrow until a winner is picked. Retrying never charges twice.</p>
            </div>
          )}
      </Card>
    </div>
  );
}
