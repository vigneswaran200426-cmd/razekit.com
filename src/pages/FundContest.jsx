import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Copy, Info,
  Landmark, QrCode, RefreshCw, Smartphone, Upload, X,
} from 'lucide-react';
import { fn, api } from '@/lib/api';
import { moneyMinor, dateShort } from '@/lib/format';
import { Button, Card, Input, Label, Badge, Skeleton, PageHeader, EmptyState, Segmented } from '@/components/ui';
import { cn } from '@/lib/cn';
import UpiPayment from '@/components/UpiPayment';

/* Statuses that mean "nothing reported yet" — anything else opens on the status view. */
const AWAITING = new Set(['FUNDING_REQUIRED', 'PAYMENT_INSTRUCTIONS_SHOWN']);
const SETTLED = new Set(['VERIFIED', 'OVERPAID']);
const TONE = { success: 'success', warning: 'warning', danger: 'danger', error: 'danger', info: 'primary', primary: 'primary', neutral: 'neutral' };
const METHOD_ICON = { BANK_TRANSFER: Landmark, UPI: Smartphone, UPI_QR: QrCode };
const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const MAX_PROOF = 10 * 1024 * 1024;

const errOf = (e) => e?.data?.error || {};
const msgOf = (e, fallback) => errOf(e).message || e?.message || fallback;
const dsc = (id, error, hint) => (error ? `${id}-e` : hint ? `${id}-h` : undefined);

/* masked_destination arrives as an object of already-masked values. Turn it into
   one short line a client can check against their own bank statement. */
function describeMasked(md, methodKey) {
  if (!md) return '';
  if (typeof md === 'string') return md;
  if ((methodKey === 'UPI' || methodKey === 'UPI_QR') && md.upi_id_masked) return md.upi_id_masked;
  return [md.bank_account_name, md.bank_account_number_masked].filter(Boolean).join(' · ') || md.upi_id_masked || '';
}

/* ── Copy control ────────────────────────────────────────────────────────── */
function CopyButton({ value, label, copiedKey, setCopiedKey, id }) {
  const copied = copiedKey === id;
  const copy = async () => {
    try { await navigator.clipboard.writeText(String(value)); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = String(value); document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }
    setCopiedKey(id);
    window.setTimeout(() => setCopiedKey((k) => (k === id ? null : k)), 2000);
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ── One labelled, copyable payment detail ───────────────────────────────── */
function FieldRow({ label, value, mono, ...copyProps }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        <p className={cn('mt-0.5 break-all text-[15px] font-semibold text-ink', mono && 'font-mono nums tracking-wide')}>{value}</p>
      </div>
      <CopyButton value={value} label={label} {...copyProps} />
    </div>
  );
}

/* ── Form field wrapper: visible label, error beside its own field ───────── */
function Field({ id, label, hint, error, required, className, children }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}{required && <span className="text-danger"> *</span>}</Label>
      {children}
      {error
        ? <p id={`${id}-e`} role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>
        : hint ? <p id={`${id}-h`} className="mt-1.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

function BetaNotice({ notice }) {
  if (!notice) return null;
  return (
    <Card className="border-warning/25 bg-warning/[0.06] p-4 sm:p-5">
      <div className="flex gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <h2 className="font-display text-[15px] font-bold text-ink">{notice.title || 'RazeKit Beta'}</h2>
          {(notice.body || []).map((line, i) => <p key={i} className="text-sm text-muted">{line}</p>)}
          {(notice.disclaimers || []).length > 0 && (
            <ul className="mt-1 space-y-1 text-[13px] text-muted">
              {notice.disclaimers.map((d, i) => <li key={i} className="flex gap-2"><span aria-hidden="true">•</span><span>{d}</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── Blocking error, one branch per documented code ──────────────────────── */
function ErrorPanel({ error, contestId, onRetry }) {
  const { code: rawCode, support: sup } = errOf(error);
  const code = rawCode || (error?.status === 403 ? 'FORBIDDEN' : 'UNKNOWN');
  const retry = <Button onClick={onRetry} variant="secondary"><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</Button>;
  const MAP = {
    CRITERIA_NOT_CONFIRMED: { title: 'Confirm the contest criteria first', action: <Button to={`/contest/${contestId}`}>Review contest criteria</Button> },
    PAYMENT_NOT_CONFIGURED: {
      title: 'Funding is not available yet',
      action: sup?.email ? <Button href={`mailto:${sup.email}`} variant="secondary">Email {sup.email}</Button> : <Button to="/help" variant="secondary">Contact RazeKit support</Button>,
    },
    FUNDING_PAUSED: { title: 'Funding is paused right now', action: retry },
    FORBIDDEN: { title: 'You cannot fund this contest', action: <Button to="/dashboard" variant="secondary">Back to dashboard</Button> },
  };
  const m = MAP[code] || { title: 'Something went wrong', action: retry };
  return <div role="alert"><EmptyState icon={AlertCircle} title={m.title} description={msgOf(error, 'This funding page could not be loaded.')} action={m.action} /></div>;
}

/* ── The details for whichever method the admin enabled ──────────────────── */
function MethodDetails({ method, copyProps }) {
  const f = method?.fields || {};
  if (method?.key === 'UPI_QR') return (
    <div className="space-y-4">
      {f.qr_image_url
        ? <img src={f.qr_image_url} alt="UPI QR code for the RazeKit contest funding account" className="w-full max-w-[240px] rounded-md border border-line bg-white p-2" />
        : <p className="text-sm text-muted">The QR image is unavailable right now. Use another method shown here, or contact support below.</p>}
      <p className="text-sm text-muted">Scan the QR code using your preferred UPI app.</p>
      {f.upi_id && <div className="border-t border-line"><FieldRow label="UPI ID" value={f.upi_id} mono id="qr-upi" {...copyProps} /></div>}
    </div>
  );
  if (method?.key === 'UPI') return <FieldRow label="UPI ID" value={f.upi_id} mono id="upi" {...copyProps} />;
  return (
    <div>
      <FieldRow label="Account name" value={f.account_name} id="acc-name" {...copyProps} />
      <FieldRow label="Account number" value={f.account_number} mono id="acc-no" {...copyProps} />
      <FieldRow label="IFSC" value={f.ifsc} mono id="ifsc" {...copyProps} />
      <FieldRow label="Bank" value={[f.bank_name, f.branch].filter(Boolean).join(' — ')} id="bank" {...copyProps} />
    </div>
  );
}

function Timeline({ items }) {
  return (
    <ol className="mt-1">
      {items.map((s, i) => {
        const Icon = s.failed ? X : s.done ? Check : Clock;
        return (
          <li key={s.key || i} className="relative pl-8 pb-5 last:pb-0">
            {i < items.length - 1 && <span aria-hidden="true" className="absolute left-[11px] top-6 bottom-0 w-px bg-line" />}
            <span className={cn('absolute left-0 top-0 grid h-6 w-6 place-items-center rounded-full',
              s.failed ? 'bg-danger/10 text-danger' : s.done ? 'bg-success/10 text-success' : 'bg-surface-2 text-muted')}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <p className={cn('text-sm font-semibold', s.failed ? 'text-danger' : s.done ? 'text-ink' : 'text-muted')}>{s.label}</p>
            <p className="text-xs text-muted">{s.at ? dateShort(s.at) : s.failed ? 'Not completed' : s.done ? 'Done' : 'Waiting'}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function FundContest() {
  const { id } = useParams();
  const fileRef = useRef(null);
  const [quote, setQuote] = useState(null);
  const [instr, setInstr] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [methodKey, setMethodKey] = useState(null);
  const [mode, setMode] = useState('instructions'); // 'instructions' | 'form' | 'status'
  const [form, setForm] = useState({ amount: '', transfer_date: '', reference: '', bank_name: '', sender_name: '', note: '' });
  const [file, setFile] = useState(null);
  const [fieldErr, setFieldErr] = useState({});
  const [formErr, setFormErr] = useState('');
  const [proofWarn, setProofWarn] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setFatal(null);
    try {
      const q = await fn('fundingQuote', { contest_id: id });
      setQuote(q);
      const [iRes, sRes] = await Promise.allSettled([
        fn('fundingInstructions', { contest_id: id }),
        fn('fundingStatus', { contest_id: id }),
      ]);
      if (iRes.status === 'rejected') { setFatal(iRes.reason); return; }
      const i = iRes.value;
      const s = sRes.status === 'fulfilled' ? sRes.value : null;
      setInstr(i); setStatus(s);
      const st = s?.funding?.status || i?.funding?.status;
      setMode(i?.already_in_progress || (st && !AWAITING.has(st)) ? 'status' : 'instructions');
      const ms = i?.instructions?.methods || [];
      if (ms.length) setMethodKey((k) => (ms.some((m) => m.key === k) ? k : ms[0].key));
      setForm((p) => ({
        ...p,
        amount: p.amount || String(i?.amount_major ?? (q?.total_amount_minor != null ? q.total_amount_minor / 100 : '')),
        transfer_date: p.transfer_date || new Date().toISOString().slice(0, 10),
      }));
    } catch (e) { setFatal(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const copyProps = { copiedKey, setCopiedKey };
  const methods = instr?.instructions?.methods || [];
  const method = useMemo(() => methods.find((m) => m.key === methodKey) || methods[0] || null, [methods, methodKey]);
  const support = status?.support || instr?.instructions?.support || quote?.beta_notice?.support || null;
  const funding = status?.funding || instr?.funding || null;
  const fundingId = funding?.id;
  const totalMinor = quote?.total_amount_minor ?? funding?.total_amount_minor ?? 0;
  const currency = quote?.currency || funding?.currency || 'INR';
  const masked = describeMasked(status?.masked_destination || instr?.masked_destination, method?.key);
  const st = funding?.status;
  const isSettled = SETTLED.has(st);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    setProofWarn('');
    if (!f) { setFile(null); return; }
    if (!PROOF_TYPES.includes(f.type)) { setFile(null); setFieldErr((p) => ({ ...p, proof: 'Attach a PNG, JPEG, WebP or PDF file.' })); return; }
    if (f.size > MAX_PROOF) { setFile(null); setFieldErr((p) => ({ ...p, proof: 'That file is larger than 10 MB. Attach a smaller one.' })); return; }
    setFieldErr((p) => ({ ...p, proof: '' })); setFile(f);
  };

  const validate = () => {
    const reference = String(form.reference).trim() ? '' : 'Enter the UTR or transaction reference from your bank or UPI app.';
    const amount = String(form.amount).trim() && Number(form.amount) > 0 ? '' : 'Enter the amount you sent.';
    setFieldErr((p) => ({ ...p, reference, amount }));
    return !reference && !amount;
  };

  const submitReport = async () => {
    setSubmitting(true); setFormErr(''); setProofWarn('');
    try {
      const bank = String(form.bank_name).trim();
      const note = String(form.note).trim();
      const res = await fn('fundingReportTransfer', {
        funding_id: fundingId,
        amount: Number(form.amount),
        reference: String(form.reference).trim(),
        // The API's `method` is the payment method used; the bank the client paid
        // FROM has no field of its own, so it rides along in the note.
        method: method?.key || 'BANK_TRANSFER',
        transfer_date: form.transfer_date || null,
        sender_name: String(form.sender_name).trim() || null,
        note: [bank && `Sent from: ${bank}`, note].filter(Boolean).join(' — ').slice(0, 500) || null,
      });
      // Proof is optional and must never invalidate a report that already landed.
      const fid = res?.funding?.id || fundingId;
      if (file && fid) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          await api.request('POST', `/api/payments/funding/${fid}/proof`, { formData: fd });
        } catch (pe) {
          setProofWarn(msgOf(pe, 'Your report was recorded, but the proof file could not be uploaded. You can add it later.'));
        }
      }
      setConfirming(false);
      const s = await fn('fundingStatus', { contest_id: id }).catch(() => null);
      if (s) setStatus(s); else if (res?.funding) setStatus((p) => ({ ...(p || {}), funding: res.funding }));
      setMode('status');
    } catch (e) {
      const code = errOf(e).code;
      const m = msgOf(e, 'Your report could not be recorded. Nothing was lost — try again.');
      setConfirming(false);
      if (code === 'REFERENCE_REQUIRED' || code === 'DUPLICATE_TRANSFER_REFERENCE' || code === 'REFERENCE_TOO_LONG') setFieldErr((p) => ({ ...p, reference: m }));
      else if (code === 'AMOUNT_REQUIRED') setFieldErr((p) => ({ ...p, amount: m }));
      else setFormErr(m);
    } finally { setSubmitting(false); }
  };

  const doCancel = async () => {
    setCancelling(true);
    try {
      await fn('fundingCancel', { funding_id: fundingId, reason: 'Cancelled by the contest owner' });
      setConfirmCancel(false);
      await load();
    } catch (e) { setFormErr(msgOf(e, 'This funding request could not be cancelled.')); }
    finally { setCancelling(false); }
  };

  if (loading) return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-80" /></div>
      <Skeleton className="h-28 rounded-lg" /><Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-56 rounded-lg" /><Skeleton className="h-48 rounded-lg" />
    </div>
  );

  const back = <Link to={`/contest/${id}`} className="inline-flex h-11 items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to contest</Link>;

  if (fatal) return <div className="mx-auto max-w-2xl space-y-5">{back}<ErrorPanel error={fatal} contestId={id} onRetry={load} /></div>;

  const breakdown = quote?.breakdown?.length ? quote.breakdown : [
    { label: 'Contest prize', amount_minor: quote?.prize_amount_minor },
    { label: 'RazeKit platform fee', amount_minor: quote?.platform_fee_minor },
    { label: 'Tax on platform charges', amount_minor: quote?.tax_minor },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {back}

      <PageHeader eyebrow="Contest funding" title="Fund your contest"
        description="Send the amount below from your own bank or UPI app, then tell us about the transfer so a person can verify it." />

      <Card className="border-ink bg-ink p-5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Amount required</p>
        <p className="mt-1.5 font-display text-4xl font-extrabold nums">{moneyMinor(totalMinor, currency)}</p>
        <p className="mt-1 text-[12px] text-white/60">Prize commitment plus RazeKit platform charges</p>
      </Card>

      <BetaNotice notice={quote?.beta_notice || instr?.beta_notice || status?.beta_notice} />

      <Card className="p-5">
        <h2 className="font-display text-lg font-bold text-ink">What you are paying for</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm">
            <caption className="sr-only">Cost breakdown for funding this contest</caption>
            <tbody className="divide-y divide-line">
              {breakdown.map((b, i) => (
                <tr key={i}>
                  <th scope="row" className="py-2.5 pr-4 text-left font-medium text-muted">
                    {b.label}
                    {b.note && <span className="mt-0.5 block text-[12px] font-normal text-muted/80">{b.note}</span>}
                  </th>
                  <td className="py-2.5 text-right font-semibold text-ink nums">{moneyMinor(b.amount_minor, currency)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="py-3 pr-4 text-left font-display font-bold text-ink">Total required</th>
                <td className="py-3 text-right font-display text-lg font-extrabold text-ink nums">{moneyMinor(totalMinor, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Pay by UPI ──────────────────────────────────────────────────
          Renders itself away entirely when UroPay is not configured, so the
          bank-transfer flow below is unchanged for everyone else. */}
      {mode !== 'status' && fundingId && totalMinor > 0 && (
        <UpiPayment
          fundingId={fundingId}
          totalMinor={totalMinor}
          currency={quote?.currency || funding?.currency || 'INR'}
          onFunded={load}
        />
      )}

      {/* ── Payment details ─────────────────────────────────────────────── */}
      {mode !== 'status' && instr?.instructions && (
        <>
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold text-ink">Pay using</h2>
            {methods.length === 0 ? (
              <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">Not currently available — no payment method has been enabled yet. Contact support below.</p>
            ) : (
              <>
                {methods.length > 1 && (
                  <div className="mt-3 overflow-x-auto pb-1">
                    <Segmented tabs={methods.map((m) => ({ key: m.key, label: m.label || m.key }))} value={method?.key} onChange={setMethodKey} />
                  </div>
                )}
                <div className="mt-4">
                  <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-muted">
                    {(() => { const I = METHOD_ICON[method?.key] || Landmark; return <I className="h-4 w-4" aria-hidden="true" />; })()}
                    {method?.label || method?.key}
                  </p>
                  <MethodDetails method={method} copyProps={copyProps} />
                </div>
              </>
            )}
            <p aria-live="polite" className="sr-only">{copiedKey ? 'Copied to clipboard' : ''}</p>
          </Card>

          {instr.transfer_note && (
            <Card className="border-primary/30 bg-primary/[0.05] p-5">
              <h2 className="font-display text-[15px] font-bold text-ink">Put this reference in the payment remarks</h2>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="break-all font-mono text-lg font-bold text-ink nums">{instr.transfer_note}</p>
                <CopyButton value={instr.transfer_note} label="payment reference" id="note" {...copyProps} />
              </div>
              <p className="mt-3 text-sm text-muted">A RazeKit team member matches your transfer to this contest by hand using this reference. Without it in the remarks, matching your payment takes longer.</p>
            </Card>
          )}

          {(instr.warning || instr.instructions.payment_instructions) && (
            <Card className="border-warning/25 bg-warning/[0.06] p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="space-y-1.5 text-sm text-ink">
                  {instr.warning && <p className="font-medium">{instr.warning}</p>}
                  {instr.instructions.payment_instructions && <p className="text-muted">{instr.instructions.payment_instructions}</p>}
                </div>
              </div>
            </Card>
          )}

          {instr.steps?.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-[15px] font-bold text-ink">How this works</h2>
              <ol className="mt-3 space-y-2">
                {instr.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-muted">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[12px] font-bold text-ink">{i + 1}</span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {mode === 'instructions' && (
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => { setMode('form'); setFormErr(''); }} disabled={!fundingId}>I have completed the transfer</Button>
              {fundingId && <Button size="lg" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel this funding request</Button>}
            </div>
          )}
        </>
      )}

      {/* ── Report form ─────────────────────────────────────────────────── */}
      {mode === 'form' && (
        <Card className="p-5">
          <h2 className="font-display text-lg font-bold text-ink">Tell us about your transfer</h2>
          <p className="mt-1 text-sm text-muted">This records a transfer you made yourself — it does not move money on RazeKit. A team member checks it against the receiving account before this contest counts as funded.</p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="f-amount" label={`Amount sent (${currency})`} error={fieldErr.amount}>
              <Input id="f-amount" type="number" inputMode="decimal" min="0" step="0.01" value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                aria-invalid={!!fieldErr.amount} aria-describedby={dsc('f-amount', fieldErr.amount)} />
            </Field>
            <Field id="f-date" label="Transfer date">
              <Input id="f-date" type="date" value={form.transfer_date} onChange={(e) => setForm((p) => ({ ...p, transfer_date: e.target.value }))} />
            </Field>
            <Field id="f-ref" label="UTR / transaction reference" required error={fieldErr.reference}
              hint="Your bank or UPI app shows this on the completed transfer." className="sm:col-span-2">
              <Input id="f-ref" value={form.reference} className="font-mono" required
                onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                aria-invalid={!!fieldErr.reference} aria-describedby={dsc('f-ref', fieldErr.reference, true)} />
            </Field>
            <Field id="f-bank" label="Bank name" hint="The bank or app you sent it from.">
              <Input id="f-bank" value={form.bank_name} onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))} aria-describedby="f-bank-h" />
            </Field>
            <Field id="f-sender" label="Name on the sending account">
              <Input id="f-sender" value={form.sender_name} onChange={(e) => setForm((p) => ({ ...p, sender_name: e.target.value }))} />
            </Field>
            <Field id="f-note" label="Note (optional)" className="sm:col-span-2">
              <textarea id="f-note" rows={3} value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </Field>
            <Field id="f-proof" label="Proof of transfer (optional)" error={fieldErr.proof}
              hint="PNG, JPEG, WebP or PDF, up to 10 MB. You can submit without it." className="sm:col-span-2">
              <input ref={fileRef} id="f-proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={onPickFile}
                aria-describedby={dsc('f-proof', fieldErr.proof, true)}
                className="block w-full text-sm text-muted file:mr-3 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface file:px-4 file:text-[13px] file:font-semibold file:text-ink hover:file:bg-surface-2" />
              {file && (
                <span className="mt-2 inline-flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />{file.name}
                  <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="ml-1 grid h-6 w-6 place-items-center rounded text-muted hover:text-ink" aria-label={`Remove ${file.name}`}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              )}
            </Field>
          </div>

          {formErr && <p role="alert" className="mt-4 rounded-md bg-danger/8 px-3 py-2 text-sm text-danger">{formErr}</p>}

          {confirming ? (
            <div className="mt-5 rounded-md border border-line-strong bg-surface-2 p-4" role="group" aria-label="Confirm your transfer report">
              <p className="text-sm font-semibold text-ink">Confirm what you are reporting</p>
              <dl className="mt-2 space-y-1 text-sm text-muted">
                <div className="flex justify-between gap-4"><dt>Amount sent</dt><dd className="font-semibold text-ink nums">{moneyMinor(Math.round(Number(form.amount || 0) * 100), currency)}</dd></div>
                <div className="flex justify-between gap-4"><dt>Reference</dt><dd className="break-all font-mono text-ink">{form.reference}</dd></div>
                <div className="flex justify-between gap-4"><dt>Sent to</dt><dd className="break-all font-mono text-ink">{masked || 'the account shown above'}</dd></div>
              </dl>
              <p className="mt-3 text-[13px] text-muted">This is a claim that you sent this money. A person checks it before the contest is treated as funded.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={submitReport} loading={submitting}>Confirm and submit report</Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>Back</Button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => { if (validate()) { setFormErr(''); setConfirming(true); } }} disabled={!fundingId}>Submit transfer report</Button>
              <Button size="lg" variant="ghost" onClick={() => setMode(instr?.instructions ? 'instructions' : 'status')}>
                {instr?.instructions ? 'Back to payment details' : 'Back to status'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Status ──────────────────────────────────────────────────────── */}
      {mode === 'status' && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-ink">Funding status</h2>
              {funding?.status_detail && <p className="mt-1 max-w-xl text-sm text-muted">{funding.status_detail}</p>}
            </div>
            <Badge tone={TONE[funding?.status_tone] || 'neutral'}>
              {isSettled && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {funding?.status_label || funding?.status || 'Awaiting verification'}
            </Badge>
          </div>

          <div aria-live="polite" className="mt-4 space-y-3">
            {proofWarn && <p className="rounded-md bg-warning/[0.08] px-3 py-2 text-sm text-warning">{proofWarn}</p>}
            {funding?.rejection_reason && <p role="alert" className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger"><strong className="font-semibold">Why it was not verified: </strong>{funding.rejection_reason}</p>}
            {funding?.needs_information_reason && <p role="alert" className="rounded-md bg-warning/[0.08] px-3 py-2 text-sm text-warning"><strong className="font-semibold">More information needed: </strong>{funding.needs_information_reason}</p>}
            {st === 'PARTIAL' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line bg-surface-2 p-3">
                  <p className="text-[12px] font-medium text-muted">Received so far</p>
                  <p className="mt-0.5 font-display text-xl font-extrabold text-ink nums">{moneyMinor(funding?.receipts_total_minor, currency)}</p>
                </div>
                <div className="rounded-md border border-warning/25 bg-warning/[0.06] p-3">
                  <p className="text-[12px] font-medium text-muted">Still outstanding</p>
                  <p className="mt-0.5 font-display text-xl font-extrabold text-warning nums">{moneyMinor(funding?.shortfall_minor, currency)}</p>
                </div>
              </div>
            )}
            {funding?.reported_reference && <p className="text-sm text-muted">Reported reference: <span className="break-all font-mono font-semibold text-ink">{funding.reported_reference}</span></p>}
            {masked && <p className="text-sm text-muted">Sent to: <span className="break-all font-mono text-ink">{masked}</span></p>}
          </div>

          {status?.timeline?.length > 0 && (
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="mb-3 font-display text-[15px] font-bold text-ink">Progress</h3>
              <Timeline items={status.timeline} />
            </div>
          )}

          {status?.proofs?.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-2 font-display text-[13px] font-bold text-ink">Files you attached</h3>
              <ul className="space-y-1 text-[13px] text-muted">
                {status.proofs.map((p) => (
                  <li key={p.id} className="flex items-center gap-2"><Upload className="h-3.5 w-3.5" aria-hidden="true" />{p.file_name}{p.uploaded_at ? <span className="text-muted/70">· {dateShort(p.uploaded_at)}</span> : null}</li>
                ))}
              </ul>
            </div>
          )}

          {formErr && <p role="alert" className="mt-4 rounded-md bg-danger/8 px-3 py-2 text-sm text-danger">{formErr}</p>}

          <div className="mt-5 flex flex-wrap gap-3">
            {!isSettled && fundingId && (
              <Button onClick={() => { setMode('form'); setConfirming(false); setFormErr(''); }}>
                {st === 'REJECTED' || st === 'NEEDS_INFORMATION' ? 'Report the transfer again' : 'Report another transfer'}
              </Button>
            )}
            <Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh status</Button>
            <Button variant="ghost" to={`/contest/${id}`}>Back to contest</Button>
          </div>
        </Card>
      )}

      {/* ── Cancel confirmation ─────────────────────────────────────────── */}
      {confirmCancel && (
        <Card className="border-danger/30 bg-danger/[0.04] p-5" role="group" aria-label="Confirm cancelling this funding request">
          <h2 className="font-display text-[15px] font-bold text-ink">Cancel this funding request?</h2>
          <p className="mt-1.5 text-sm text-muted">
            This closes the request for {moneyMinor(totalMinor, currency)}{masked ? ` to ${masked}` : ''}. If you have already sent the money, do not cancel — report the transfer instead so a person can trace it.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="danger" onClick={doCancel} loading={cancelling}>Yes, cancel the request</Button>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Keep it open</Button>
          </div>
        </Card>
      )}

      {(support?.phone || support?.email || instr?.verification_window_hours) && (
        <Card className="p-4">
          <p className="text-[13px] text-muted">
            {instr?.verification_window_hours ? `Verification usually takes up to ${instr.verification_window_hours} hours on working days. ` : ''}
            Need help with a transfer?{' '}
            {support?.email && <a className="font-semibold text-primary hover:underline" href={`mailto:${support.email}`}>{support.email}</a>}
            {support?.email && support?.phone ? ' · ' : ''}
            {support?.phone && <a className="font-semibold text-primary hover:underline" href={`tel:${String(support.phone).replace(/\s+/g, '')}`}>{support.phone}</a>}
          </p>
        </Card>
      )}
    </div>
  );
}
