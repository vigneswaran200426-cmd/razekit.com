// Admin → Finance. The control point for the manual beta money flow.
//
// Everything on this screen is a view onto the backend's authoritative state.
// No number here is computed in the browser, and no action here changes money
// by itself — each one calls a server handler that re-checks the permission,
// runs inside a database transaction and posts to the immutable ledger.
//
// Two rules this file follows throughout:
//   1. Financial data is MASKED unless the server chose to reveal it.
//   2. Every action that moves money goes through an explicit confirmation that
//      restates who, how much, to which account, and with what reference.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, Banknote, BookOpen, CheckCircle2, ClipboardList, Coins,
  CreditCard, Eye, FileText, Landmark, Loader2, Lock, RefreshCw, Scale, Search,
  Settings2, ShieldAlert, Trash2, TrendingUp, Users, Wallet, XCircle,
} from 'lucide-react';
import { fn, api } from '@/lib/api';
import { moneyMinor, dateShort } from '@/lib/format';
import { Card, Button, Input, Label, Badge, Spinner, Skeleton, Segmented, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'verification', label: 'Deposit verification' },
  { key: 'funding', label: 'Funding' },
  { key: 'balances', label: 'User balances' },
  { key: 'commitments', label: 'Prize commitments' },
  { key: 'withdrawals', label: 'Withdrawal requests' },
  { key: 'payouts', label: 'Payout processing' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'settings', label: 'Payment settings' },
  { key: 'audit', label: 'Financial audit' },
];

const TONE = { success: 'success', danger: 'danger', warning: 'warning', primary: 'primary', neutral: 'neutral' };
const SEV = { high: 'danger', medium: 'warning', low: 'neutral' };

const errText = (e) => e?.data?.error?.message || e?.message || 'Something went wrong.';
const errCode = (e) => e?.data?.error?.code || null;

/* ── small shared pieces ─────────────────────────────────────────────────── */

function Money({ minor, currency = 'INR', className }) {
  return <span className={cn('nums tabular-nums', className)}>{moneyMinor(minor, currency)}</span>;
}

function Kpi({ label, value, sub, tone, icon: Icon }) {
  return (
    <div className={cn('rounded-lg border bg-surface p-3', tone === 'danger' ? 'border-danger/30' : 'border-line')}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />} {label}
      </p>
      <p className="mt-0.5 font-display text-xl font-extrabold text-ink nums">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Group({ title, icon: Icon, actions, children }) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />} {title}
        </h3>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/** Wide content must scroll inside its own container, never the page. */
function Table({ head, children, empty }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {head.map((h) => (
              <th key={h} className="py-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

function Err({ error }) {
  if (!error) return null;
  return (
    <div className="rounded-md bg-danger/8 px-3 py-2 text-sm text-danger" role="alert">
      {typeof error === 'string' ? error : errText(error)}
    </div>
  );
}

function Ok({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-md bg-success/8 px-3 py-2 text-sm text-success" role="status" aria-live="polite">{children}</div>
  );
}

/**
 * High-risk actions never fire from a single click. This panel restates the
 * facts that matter — who, how much, which account, which reference — and makes
 * the operator confirm against them.
 */
function Confirm({ title, warning, rows, confirmLabel, tone = 'primary', busy, onConfirm, onCancel, children }) {
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2 p-4 space-y-3" role="alertdialog" aria-label={title}>
      <p className="font-display text-sm font-bold text-ink">{title}</p>
      {warning && (
        <p className="flex items-start gap-1.5 rounded-md bg-warning/[0.08] px-3 py-2 text-[12px] leading-relaxed text-ink">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-warning mt-px" aria-hidden="true" />{warning}
        </p>
      )}
      {rows?.length > 0 && (
        <dl className="rounded-md border border-line bg-surface p-3 text-[13px] space-y-1">
          {rows.filter(Boolean).map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">{r.label}</dt>
              <dd className={cn('text-ink font-medium text-right', r.mono && 'nums tabular-nums')}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  );
}

/** A permission the caller does not hold disables the control and says which one. */
function useGate(permissions) {
  return useCallback(
    (perm) => {
      const held = Array.isArray(permissions) && permissions.includes(perm);
      return { allowed: held, title: held ? undefined : `Requires the '${perm}' permission.` };
    },
    [permissions]
  );
}

function useAsync(handler, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    handler()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/* ── Overview ────────────────────────────────────────────────────────────── */

function OverviewTab({ onJump }) {
  const { data, error, loading, reload } = useAsync(() => fn('financeOverview'));
  if (loading) return <div className="grid sm:grid-cols-3 gap-2">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>;
  if (error) return <Err error={error} />;
  const k = data.kpis;

  return (
    <div className="space-y-5">
      {data.attention?.length > 0 && (
        <Card className="p-4 border-warning/30 bg-warning/[0.05]">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Needs attention
          </h3>
          <ul className="mt-2 space-y-1.5">
            {data.attention.map((a) => (
              <li key={a.kind} className="flex items-center gap-2 text-sm">
                <Badge tone={SEV[a.severity] || 'neutral'}>{a.count}</Badge>
                <span className="text-muted">{a.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Group title="Operations" icon={TrendingUp} actions={<Button size="sm" variant="ghost" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <Kpi label="Pending funding" value={k.pending_funding} sub={moneyMinor(k.pending_funding_minor)} icon={ClipboardList} tone={k.pending_funding ? 'danger' : undefined} />
          <Kpi label="Verified today" value={k.verified_funding_today} sub={moneyMinor(k.verified_funding_today_minor)} icon={BadgeCheck} />
          <Kpi label="Total verified" value={k.total_verified_funding} sub={moneyMinor(k.total_verified_funding_minor)} icon={Coins} />
          <Kpi label="Reserved prizes" value={moneyMinor(k.reserved_contest_prizes_minor)} icon={Lock} />
          <Kpi label="Ledger exceptions" value={k.ledger_exceptions} icon={ShieldAlert} tone={k.ledger_exceptions ? 'danger' : undefined} />
          <Kpi label="Pending withdrawals" value={k.pending_withdrawals} sub={moneyMinor(k.pending_withdrawals_minor)} icon={Wallet} tone={k.pending_withdrawals ? 'danger' : undefined} />
          <Kpi label="Processing withdrawals" value={k.processing_withdrawals} sub={moneyMinor(k.processing_withdrawals_minor)} icon={Loader2} />
          <Kpi label="Paid withdrawals" value={k.paid_withdrawals} sub={moneyMinor(k.paid_withdrawals_minor)} icon={CheckCircle2} />
          <Kpi label="Unresolved reconciliation" value={k.unresolved_reconciliation} icon={Scale} tone={k.unresolved_reconciliation ? 'danger' : undefined} />
        </div>
      </Group>

      <Group title="Ledger balances" icon={BookOpen}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Bank settlement" value={moneyMinor(data.balances.bank_settlement_minor)} />
          <Kpi label="Client funds held" value={moneyMinor(data.balances.client_funds_held_minor)} />
          <Kpi label="Prize committed" value={moneyMinor(data.balances.contest_prize_committed_minor)} />
          <Kpi label="Owed to creators" value={moneyMinor(data.balances.payout_liability_minor)} />
          <Kpi label="Withdrawals in flight" value={moneyMinor(data.balances.withdrawal_pending_minor)} />
          <Kpi label="Platform fee" value={moneyMinor(data.balances.platform_fee_minor)} />
          <Kpi label="Tax payable" value={moneyMinor(data.balances.tax_payable_minor)} />
          <Kpi label="Refunds pending" value={moneyMinor(data.balances.refund_clearing_minor)} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          Every figure is replayed from the immutable ledger. Nothing on this page is a stored counter.
        </p>
      </Group>

      {data.exceptions?.length > 0 && (
        <Group title="Ledger exceptions" icon={ShieldAlert}>
          <ul className="space-y-1 text-sm">
            {data.exceptions.map((x) => (
              <li key={`${x.kind}-${x.id}`} className="flex items-center gap-2">
                <Badge tone="danger">{String(x.kind).replace(/_/g, ' ')}</Badge>
                <span className="text-muted">{x.reference || x.id}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group title="Destination account" icon={Landmark}>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">Account name</dt><dd className="text-ink">{data.destination.bank_account_name || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Bank</dt><dd className="text-ink">{data.destination.bank_name || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Account</dt><dd className="text-ink nums">{data.destination.bank_account_number_masked || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">IFSC</dt><dd className="text-ink nums">{data.destination.bank_ifsc_masked || '—'}</dd></div>
        </dl>
        <p className="text-[11px] text-muted">
          Masked here on purpose — a dashboard screenshot travels. Reveal the full account in Payment settings.
        </p>
        <Button size="sm" variant="secondary" onClick={() => onJump('settings')}><Settings2 className="w-3.5 h-3.5" /> Payment settings</Button>
      </Group>
    </div>
  );
}

/* ── Deposit verification ────────────────────────────────────────────────── */

function VerificationTab() {
  const { data, error, loading, reload } = useAsync(() => fn('financeFundingQueue'));
  const [openId, setOpenId] = useState(null);
  const gate = useGate(data?.permissions);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;
  if (!data.queue.length) {
    return <EmptyState icon={CheckCircle2} title="Nothing waiting" description="No reported transfers are waiting to be checked against the bank." />;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-surface-2 border-line-strong">
        <p className="text-[13px] leading-relaxed text-ink">
          These are <strong>claims</strong>, not payments. Open the bank statement and match each one before verifying.
          Verifying is what creates the ledger credit and puts the contest live.
        </p>
      </Card>

      <Group title={`Awaiting verification (${data.count})`} icon={ClipboardList} actions={<Button size="sm" variant="ghost" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>}>
        <Table head={['Reference', 'Client', 'Contest', 'Expected', 'Reported', 'Difference', 'UTR', 'Waiting', '']}>
          {data.queue.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 align-top">
              <td className="py-2 pr-3 nums text-[12px]">{r.reference}</td>
              <td className="py-2 pr-3">{r.client_name}</td>
              <td className="py-2 pr-3 max-w-[200px] truncate">{r.contest_title || '—'}</td>
              <td className="py-2 pr-3"><Money minor={r.expected_amount_minor} currency={r.currency} /></td>
              <td className="py-2 pr-3"><Money minor={r.reported_amount_minor} currency={r.currency} /></td>
              <td className="py-2 pr-3">
                {r.amount_match ? (
                  <Badge tone={r.amount_match === 'MATCHED' ? 'success' : r.amount_match === 'OVERPAID' ? 'primary' : 'danger'}>
                    {r.amount_match}
                  </Badge>
                ) : '—'}
              </td>
              <td className="py-2 pr-3 nums text-[12px]">{r.reported_reference || '—'}</td>
              <td className="py-2 pr-3 text-muted">{r.waiting_hours != null ? `${r.waiting_hours}h` : '—'}</td>
              <td className="py-2">
                <Button size="sm" variant="secondary" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  {openId === r.id ? 'Close' : 'Review'}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Group>

      {openId && <VerifyPanel fundingId={openId} gate={gate} onDone={() => { setOpenId(null); reload(); }} />}
    </div>
  );
}

function VerifyPanel({ fundingId, gate, onDone }) {
  const { data, error, loading, reload } = useAsync(() => fn('financeFundingDetail', { funding_id: fundingId }), [fundingId]);
  const [form, setForm] = useState({ bank_reference: '', verified_amount: '', received_date: '', note: '' });
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState(null); // 'verify' | 'reject' | 'info' | 'partial'
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  const [done, setDone] = useState('');
  const [shortfall, setShortfall] = useState(null);

  useEffect(() => {
    if (data?.funding && !form.verified_amount) {
      setForm((f) => ({ ...f, verified_amount: String((data.funding.reported_amount_minor ?? data.funding.total_amount_minor) / 100) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.funding?.id]);

  if (loading) return <Skeleton className="h-72 rounded-lg" />;
  if (error) return <Err error={error} />;
  const f = data.funding;
  const canVerify = gate('finance.verify_funding');

  const submit = async (acceptPartial = false) => {
    setBusy(true); setFail(null);
    try {
      const r = await fn('financeVerifyFunding', {
        funding_id: fundingId,
        bank_reference: form.bank_reference.trim(),
        verified_amount: form.verified_amount === '' ? undefined : Number(form.verified_amount),
        received_date: form.received_date || undefined,
        note: form.note || undefined,
        accept_partial: acceptPartial || undefined,
      });
      setDone(
        r.match === 'PARTIAL'
          ? `Part payment of ${moneyMinor(r.receipt_amount_minor)} recorded. ${moneyMinor(r.expected_amount_minor - r.running_total_minor)} still outstanding.`
          : `Verified. ${moneyMinor(r.receipt_amount_minor)} credited${r.contest_published ? ' and the contest is now live' : ''}.`
      );
      setMode(null); setShortfall(null);
      setTimeout(onDone, 1200);
    } catch (e) {
      if (errCode(e) === 'AMOUNT_SHORTFALL') {
        setShortfall(e.data.error);
        setFail(e);
      } else { setFail(e); }
    } finally { setBusy(false); }
  };

  const refuse = async (askOnly) => {
    setBusy(true); setFail(null);
    try {
      await fn('financeRejectFunding', { funding_id: fundingId, reason: reason.trim(), action: askOnly ? 'request_information' : undefined });
      setDone(askOnly ? 'Information requested. The client has been told what is needed.' : 'Rejected. The client has been told why.');
      setMode(null);
      setTimeout(onDone, 1200);
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{f.reference}</h3>
          <p className="text-[13px] text-muted">
            {data.client?.name} · {data.contest?.title || f.contest_id}
          </p>
        </div>
        <Badge tone={TONE[f.status_tone] || 'neutral'}>{f.status_label}</Badge>
      </div>

      <Ok>{done}</Ok>
      <Err error={fail && !shortfall ? fail : null} />

      <div className="grid sm:grid-cols-2 gap-4">
        <dl className="rounded-md border border-line bg-surface-2 p-3 text-[13px] space-y-1">
          <div className="flex justify-between gap-3"><dt className="text-muted">Expected</dt><dd className="text-ink nums font-medium"><Money minor={f.expected_amount_minor} currency={f.currency} /></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Client reported</dt><dd className="text-ink nums"><Money minor={f.reported_amount_minor} currency={f.currency} /></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Bank reference reported</dt><dd className="text-ink nums">{f.reported_reference || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Transfer date</dt><dd className="text-ink">{f.reported_transfer_date || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Sender name</dt><dd className="text-ink">{f.reported_sender_name || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Amount match</dt><dd className="text-ink">{f.amount_match || '—'}</dd></div>
        </dl>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Proof uploaded by the client</p>
          {data.proofs.length === 0 && <p className="text-[13px] text-muted">No proof was uploaded. Proof is optional — the bank statement is what decides.</p>}
          {data.proofs.map((p) => (
            <a key={p.id} href={p.signed_url || '#'} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink hover:border-line-strong">
              <FileText className="w-4 h-4 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{p.file_name}</span>
              <Eye className="w-4 h-4 text-muted" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      {data.receipts?.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">Receipts already recorded</p>
          <ul className="text-[13px] space-y-0.5">
            {data.receipts.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="text-muted nums">{r.bank_reference}</span>
                <span className="text-ink nums"><Money minor={r.amount_minor} /> · {r.match_class}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!mode && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canVerify.allowed} title={canVerify.title} onClick={() => setMode('verify')}>
            <BadgeCheck className="w-4 h-4" /> Verify funding
          </Button>
          <Button variant="secondary" disabled={!canVerify.allowed} title={canVerify.title} onClick={() => setMode('info')}>
            Request information
          </Button>
          <Button variant="danger" disabled={!canVerify.allowed} title={canVerify.title} onClick={() => setMode('reject')}>
            <XCircle className="w-4 h-4" /> Reject
          </Button>
          <Button variant="ghost" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Reload</Button>
        </div>
      )}

      {mode === 'verify' && (
        <div className="space-y-3 rounded-lg border border-line-strong bg-surface-2 p-4">
          <p className="font-display text-sm font-bold text-ink">Verify against the bank statement</p>
          <p className="text-[12px] leading-relaxed text-muted">
            Enter what the <strong>bank</strong> shows, not what the client reported. This posts a ledger credit
            and cannot be undone except by a reversal.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vb-ref">Bank reference (UTR) *</Label>
              <Input id="vb-ref" value={form.bank_reference} onChange={(e) => setForm({ ...form, bank_reference: e.target.value })} placeholder="As it appears on the statement" />
            </div>
            <div>
              <Label htmlFor="vb-amt">Amount on the statement *</Label>
              <Input id="vb-amt" type="number" step="0.01" value={form.verified_amount} onChange={(e) => setForm({ ...form, verified_amount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vb-date">Value date</Label>
              <Input id="vb-date" type="date" value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vb-note">Note</Label>
              <Input id="vb-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional" />
            </div>
          </div>

          {shortfall && (
            <div className="rounded-md border border-warning/30 bg-warning/[0.07] p-3 space-y-2">
              <p className="text-[13px] text-ink">
                The bank shows <strong>{moneyMinor(shortfall.actual_amount_minor)}</strong> but{' '}
                <strong>{moneyMinor(shortfall.expected_amount_minor)}</strong> is due
                ({moneyMinor(Math.abs(shortfall.difference_minor))} short).
              </p>
              <p className="text-[12px] text-muted">
                Recording it as a part payment credits the money that really arrived. The prize is not reserved and
                the contest does not go live until the balance is received.
              </p>
              <Button size="sm" variant="secondary" loading={busy} onClick={() => submit(true)}>
                Record as part payment
              </Button>
            </div>
          )}

          <Confirm
            title="Confirm verification"
            warning="This creates real money in RazeKit's books and publishes the contest."
            rows={[
              { label: 'Client', value: data.client?.name || '—' },
              { label: 'Contest', value: data.contest?.title || f.contest_id },
              { label: 'Amount', value: moneyMinor(Number(form.verified_amount || 0) * 100, f.currency), mono: true },
              { label: 'Bank reference', value: form.bank_reference || '—', mono: true },
            ]}
            confirmLabel="Verify funding"
            busy={busy}
            onConfirm={() => submit(false)}
            onCancel={() => { setMode(null); setShortfall(null); setFail(null); }}
          />
        </div>
      )}

      {(mode === 'reject' || mode === 'info') && (
        <div className="space-y-3 rounded-lg border border-line-strong bg-surface-2 p-4">
          <Label htmlFor="rj-reason">
            {mode === 'reject' ? 'Why can this not be verified?' : 'What do you need from the client?'} * (min 10 characters)
          </Label>
          <textarea
            id="rj-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            placeholder={mode === 'reject' ? 'No credit found on the statement for this reference.' : 'Please send the bank confirmation showing the UTR.'}
          />
          <p className="text-[12px] text-muted">The client is shown this text exactly.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setMode(null); setReason(''); }} disabled={busy}>Cancel</Button>
            <Button
              variant={mode === 'reject' ? 'danger' : 'primary'}
              loading={busy}
              disabled={reason.trim().length < 10}
              onClick={() => refuse(mode === 'info')}
            >
              {mode === 'reject' ? 'Reject funding' : 'Request information'}
            </Button>
          </div>
        </div>
      )}

      {data.audit?.length > 0 && (
        <details className="rounded-md border border-line bg-surface-2 p-3">
          <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wider text-muted">Audit history</summary>
          <ul className="mt-2 space-y-1 text-[12px]">
            {data.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2">
                <span className="text-muted">{dateShort(a.created_date)}</span>
                <span className="text-ink font-medium">{a.action}</span>
                <Badge tone={a.status === 'success' ? 'success' : a.status === 'blocked' ? 'warning' : 'danger'}>{a.status}</Badge>
                <span className="text-muted">{a.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/* ── Funding (all history) ───────────────────────────────────────────────── */

function FundingTab() {
  const [filters, setFilters] = useState({ status: '', q: '', from: '', to: '' });
  const [applied, setApplied] = useState({ all: true });
  const { data, error, loading } = useAsync(() => fn('financeFundingQueue', applied), [JSON.stringify(applied)]);

  return (
    <div className="space-y-4">
      <Group title="Filters" icon={Search}>
        <div className="grid sm:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="ff-status">Status</Label>
            <select id="ff-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
              <option value="">All</option>
              {['FUNDING_REQUIRED', 'PAYMENT_INSTRUCTIONS_SHOWN', 'TRANSFER_REPORTED', 'PENDING_VERIFICATION',
                'NEEDS_INFORMATION', 'PARTIAL', 'OVERPAID', 'VERIFIED', 'REJECTED', 'CANCELLED',
                'REFUND_PENDING', 'REFUNDED'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><Label htmlFor="ff-q">Reference / UTR</Label><Input id="ff-q" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
          <div><Label htmlFor="ff-from">From</Label><Input id="ff-from" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><Label htmlFor="ff-to">To</Label><Input id="ff-to" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
        </div>
        <Button size="sm" onClick={() => setApplied({ all: true, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })}>
          Apply filters
        </Button>
      </Group>

      {loading ? <Skeleton className="h-64 rounded-lg" /> : error ? <Err error={error} /> : (
        <Group title={`Funding requests (${data.count} of ${data.total})`} icon={Banknote}>
          <Table head={['Reference', 'Client', 'Contest', 'Amount', 'Status', 'UTR', 'Created']}>
            {data.queue.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 nums text-[12px]">{r.reference}</td>
                <td className="py-2 pr-3">{r.client_name}</td>
                <td className="py-2 pr-3 max-w-[200px] truncate">{r.contest_title || '—'}</td>
                <td className="py-2 pr-3"><Money minor={r.total_amount_minor} currency={r.currency} /></td>
                <td className="py-2 pr-3"><Badge tone={TONE[r.status_tone] || 'neutral'}>{r.status_label}</Badge></td>
                <td className="py-2 pr-3 nums text-[12px]">{r.reported_reference || '—'}</td>
                <td className="py-2 pr-3 text-muted">{dateShort(r.created_date)}</td>
              </tr>
            ))}
          </Table>
          {data.queue.length === 0 && <p className="py-6 text-center text-sm text-muted">No funding requests match those filters.</p>}
        </Group>
      )}
    </div>
  );
}

/* ── User balances ───────────────────────────────────────────────────────── */

function BalancesTab() {
  const { data, error, loading } = useAsync(() => fn('financeUserBalances'));
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);

  const open = async (id) => {
    setDetail(id); setDetailData(null);
    try { setDetailData(await fn('financeUserBalances', { user_id: id })); } catch (e) { setDetailData({ error: errText(e) }); }
  };

  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;

  return (
    <div className="space-y-4">
      <Group title={`User balances (${data.count})`} icon={Users}>
        <Table head={['User', 'Role', 'Available', 'Pending', 'Total', '']}>
          {data.balances.map((b) => (
            <tr key={b.owner_id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3"><span className="text-ink">{b.name}</span><span className="block text-[11px] text-muted">{b.email}</span></td>
              <td className="py-2 pr-3 text-muted">{b.user_role || b.owner_type}</td>
              <td className="py-2 pr-3"><Money minor={b.available_minor} /></td>
              <td className="py-2 pr-3"><Money minor={b.pending_minor} /></td>
              <td className="py-2 pr-3 font-medium"><Money minor={b.total_minor} /></td>
              <td className="py-2"><Button size="sm" variant="secondary" onClick={() => open(b.owner_id)}>Ledger</Button></td>
            </tr>
          ))}
        </Table>
        {data.balances.length === 0 && <p className="py-6 text-center text-sm text-muted">No user has a ledger balance yet.</p>}
      </Group>

      {detail && (
        <Group title="Account detail" icon={BookOpen} actions={<Button size="sm" variant="ghost" onClick={() => setDetail(null)}>Close</Button>}>
          {!detailData ? <Spinner className="w-5 h-5" /> : detailData.error ? <Err error={detailData.error} /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Kpi label="Total" value={moneyMinor(detailData.balance.total_minor)} />
                <Kpi label="Available" value={moneyMinor(detailData.balance.available_minor)} />
                <Kpi label="Reserved" value={moneyMinor(detailData.balance.reserved_minor)} />
                <Kpi label="Pending" value={moneyMinor(detailData.balance.pending_minor)} />
                <Kpi label="Paid out" value={moneyMinor(detailData.balance.paid_out_minor)} />
              </div>
              <Table head={['Posted', 'Account', 'Type', 'Direction', 'Amount', 'Balance after']}>
                {detailData.entries.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-muted">{dateShort(e.posted_at)}</td>
                    <td className="py-2 pr-3 text-[12px]">{e.account_class}</td>
                    <td className="py-2 pr-3 text-[12px]">{e.entry_type}</td>
                    <td className="py-2 pr-3"><Badge tone={e.direction === 'CREDIT' ? 'success' : 'neutral'}>{e.direction}</Badge></td>
                    <td className="py-2 pr-3"><Money minor={e.amount_minor} /></td>
                    <td className="py-2 pr-3 text-muted"><Money minor={e.balance_after_minor} /></td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Group>
      )}
    </div>
  );
}

/* ── Prize commitments ───────────────────────────────────────────────────── */

function CommitmentsTab() {
  const { data, error, loading } = useAsync(() => fn('financePrizeCommitments'));
  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;

  return (
    <Group title={`Prize commitments (${data.open_count} open · ${moneyMinor(data.total_minor)})`} icon={Lock}>
      <p className="text-[12px] leading-relaxed text-muted">
        Money committed to one specific contest. It cannot be spent on another contest or withdrawn by the client
        while it sits here.
      </p>
      <Table head={['Contest', 'Client', 'Status', 'Committed', 'Winner', 'Funded']}>
        {data.commitments.map((c) => (
          <tr key={c.account_id} className="border-b border-line last:border-0">
            <td className="py-2 pr-3 max-w-[240px] truncate">{c.contest_title || c.contest_id}</td>
            <td className="py-2 pr-3">{c.client_name}</td>
            <td className="py-2 pr-3 text-muted">{c.contest_status || '—'}</td>
            <td className="py-2 pr-3 font-medium"><Money minor={c.committed_minor} currency={c.currency} /></td>
            <td className="py-2 pr-3">{c.winner_user_id ? <Badge tone="success">Awarded</Badge> : <span className="text-muted">—</span>}</td>
            <td className="py-2 pr-3 text-muted">{c.funded_at ? dateShort(c.funded_at) : '—'}</td>
          </tr>
        ))}
      </Table>
      {data.commitments.length === 0 && <p className="py-6 text-center text-sm text-muted">No prize is currently committed.</p>}
    </Group>
  );
}

/* ── Withdrawal requests + payout processing ─────────────────────────────── */

function WithdrawalsTab({ processing = false }) {
  const { data, error, loading, reload } = useAsync(() => fn('financeWithdrawalQueue'));
  const [openId, setOpenId] = useState(null);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;

  const rows = processing
    ? data.queue.filter((w) => ['APPROVED', 'PROCESSING', 'TRANSFER_SENT', 'FAILED'].includes(w.status))
    : data.queue.filter((w) => ['REQUESTED', 'UNDER_REVIEW', 'ON_HOLD'].includes(w.status));

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-surface-2 border-line-strong">
        <p className="text-[13px] leading-relaxed text-ink">
          {processing
            ? 'These are approved. Make the bank transfer yourself, enter the UTR, then confirm the payout — confirming is what posts the ledger debit.'
            : 'A creator has asked to withdraw. The amount is already reserved on their balance; nothing has left RazeKit.'}
        </p>
      </Card>

      <Group title={`${processing ? 'Payout processing' : 'Withdrawal requests'} (${rows.length})`} icon={Wallet}
        actions={<Button size="sm" variant="ghost" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>}>
        <Table head={['Reference', 'Creator', 'Amount', 'Available', 'Account', 'Status', 'Waiting', '']}>
          {rows.map((w) => (
            <tr key={w.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 nums text-[12px]">{w.reference}</td>
              <td className="py-2 pr-3">
                {w.creator_name}
                {w.same_person_approved_and_confirmed && (
                  <Badge tone="warning" className="ml-1.5">same approver</Badge>
                )}
              </td>
              <td className="py-2 pr-3 font-medium"><Money minor={w.amount_minor} currency={w.currency} /></td>
              <td className="py-2 pr-3 text-muted"><Money minor={w.available_minor} /></td>
              <td className="py-2 pr-3 nums text-[12px]">{w.bank_account_masked || '—'}</td>
              <td className="py-2 pr-3"><Badge tone={TONE[w.status_tone] || 'neutral'}>{w.status_label}</Badge></td>
              <td className="py-2 pr-3 text-muted">{w.waiting_hours != null ? `${w.waiting_hours}h` : '—'}</td>
              <td className="py-2"><Button size="sm" variant="secondary" onClick={() => setOpenId(openId === w.id ? null : w.id)}>{openId === w.id ? 'Close' : 'Open'}</Button></td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing in this queue.</p>}
      </Group>

      {openId && <WithdrawalPanel id={openId} permissions={data.permissions} onDone={() => { setOpenId(null); reload(); }} />}
    </div>
  );
}

function WithdrawalPanel({ id, permissions, onDone }) {
  const { data, error, loading, reload } = useAsync(() => fn('financeWithdrawalDetail', { withdrawal_id: id }), [id]);
  const gate = useGate(permissions);
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [transfer, setTransfer] = useState({ payment_reference: '', transfer_date: '', method: 'BANK_TRANSFER', note: '' });
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  const [done, setDone] = useState('');

  if (loading) return <Skeleton className="h-72 rounded-lg" />;
  if (error) return <Err error={error} />;
  const w = data.withdrawal;

  const call = async (name, payload, message) => {
    setBusy(true); setFail(null);
    try {
      const r = await fn(name, payload);
      setDone(r.already_paid ? 'Already confirmed — no second debit was created.' : message);
      setMode(null);
      setTimeout(() => { reload(); onDone(); }, 1200);
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  const canReview = gate('finance.review_withdrawal');
  const canApprove = gate('finance.approve_withdrawal');
  const canConfirm = gate('finance.confirm_payout');

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{w.reference}</h3>
          <p className="text-[13px] text-muted">{data.creator?.name} · {data.creator?.email}</p>
        </div>
        <Badge tone={TONE[w.status_tone] || 'neutral'}>{w.status_label}</Badge>
      </div>

      <Ok>{done}</Ok>
      <Err error={fail} />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Kpi label="Requested" value={moneyMinor(w.amount_minor, w.currency)} />
        <Kpi label="Total balance" value={moneyMinor(data.balance.total_minor)} />
        <Kpi label="Available" value={moneyMinor(data.balance.available_minor)} />
        <Kpi label="Pending" value={moneyMinor(data.balance.pending_minor)} />
        <Kpi label="Paid out" value={moneyMinor(data.balance.paid_out_minor)} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-line bg-surface-2 p-3 text-[13px] space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">Destination account</p>
          <div className="flex justify-between gap-3"><span className="text-muted">Holder</span><span className="text-ink">{data.bank_masked?.account_holder_name || '—'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Bank</span><span className="text-ink">{data.bank_masked?.bank_name || '—'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted">Account</span><span className="text-ink nums">{data.bank_masked?.account_number_masked || '—'}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted">IFSC</span><span className="text-ink nums">{data.bank_masked?.ifsc_masked || '—'}</span></div>
        </div>

        {data.bank_full ? (
          <div className="rounded-md border border-warning/40 bg-warning/[0.06] p-3 text-[13px] space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">
              <ShieldAlert className="w-3.5 h-3.5 text-warning" aria-hidden="true" /> Full details — disclosure logged
            </p>
            <div className="flex justify-between gap-3"><span className="text-muted">Holder</span><span className="text-ink">{data.bank_full.account_holder_name}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted">Account</span><span className="text-ink nums">{data.bank_full.account_number}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted">IFSC</span><span className="text-ink nums">{data.bank_full.ifsc}</span></div>
            <p className="text-[11px] text-muted pt-1">Use these for the transfer only. Do not copy them elsewhere.</p>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-surface-2 p-3 text-[12px] text-muted">
            Full account details are revealed only once the request is approved, and only to a holder of
            <span className="text-ink"> finance.view_sensitive_financial_data</span>. Every disclosure is logged.
          </div>
        )}
      </div>

      {data.payout_history?.length > 0 && (
        <details className="rounded-md border border-line bg-surface-2 p-3">
          <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wider text-muted">Payout history ({data.payout_history.length})</summary>
          <ul className="mt-2 space-y-1 text-[12px]">
            {data.payout_history.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-muted">{p.contest_title || p.reference}</span>
                <span className="text-ink nums"><Money minor={p.amount_minor} /> · {p.status}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!mode && (
        <div className="flex flex-wrap gap-2">
          {['REQUESTED', 'ON_HOLD'].includes(w.status) && (
            <Button variant="secondary" disabled={!canReview.allowed} title={canReview.title}
              onClick={() => call('financeWithdrawalReview', { withdrawal_id: id, action: 'review' }, 'Marked under review.')}>
              Start review
            </Button>
          )}
          {['REQUESTED', 'UNDER_REVIEW'].includes(w.status) && (
            <>
              <Button disabled={!canApprove.allowed} title={canApprove.title} onClick={() => setMode('approve')}>
                <CheckCircle2 className="w-4 h-4" /> Approve
              </Button>
              <Button variant="secondary" disabled={!canReview.allowed} title={canReview.title} onClick={() => setMode('hold')}>Place on hold</Button>
              <Button variant="danger" disabled={!canApprove.allowed} title={canApprove.title} onClick={() => setMode('reject')}>Reject</Button>
            </>
          )}
          {['APPROVED', 'PROCESSING', 'FAILED'].includes(w.status) && (
            <Button disabled={!canConfirm.allowed} title={canConfirm.title} onClick={() => setMode('sent')}>
              <Banknote className="w-4 h-4" /> I have made the transfer
            </Button>
          )}
          {w.status === 'TRANSFER_SENT' && (
            <Button disabled={!canConfirm.allowed} title={canConfirm.title} onClick={() => setMode('confirm')}>
              <BadgeCheck className="w-4 h-4" /> Confirm payout
            </Button>
          )}
          {['APPROVED', 'PROCESSING', 'TRANSFER_SENT'].includes(w.status) && (
            <Button variant="danger" disabled={!canConfirm.allowed} title={canConfirm.title} onClick={() => setMode('fail')}>Transfer failed</Button>
          )}
          <Button variant="ghost" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Reload</Button>
        </div>
      )}

      {mode === 'approve' && (
        <Confirm
          title="Approve this withdrawal for transfer"
          warning="Approving does not move money. It authorises you to make the bank transfer."
          rows={[
            { label: 'Creator', value: data.creator?.name },
            { label: 'Amount', value: moneyMinor(w.amount_minor, w.currency), mono: true },
            { label: 'Account', value: data.bank_masked?.account_number_masked || '—', mono: true },
            { label: 'Available on ledger', value: moneyMinor(data.balance.pending_minor), mono: true },
          ]}
          confirmLabel="Approve"
          busy={busy}
          onConfirm={() => call('financeWithdrawalApprove', { withdrawal_id: id }, 'Approved for transfer.')}
          onCancel={() => setMode(null)}
        />
      )}

      {(mode === 'reject' || mode === 'hold' || mode === 'fail') && (
        <div className="space-y-3 rounded-lg border border-line-strong bg-surface-2 p-4">
          <Label htmlFor="wd-reason">Reason * (min 10 characters — the creator is shown this)</Label>
          <textarea id="wd-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          {mode === 'reject' && <p className="text-[12px] text-muted">Rejecting returns the reserved amount to the creator's available balance.</p>}
          {mode === 'fail' && <p className="text-[12px] text-muted">The reservation stays in place; the creator loses nothing.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setMode(null); setReason(''); }} disabled={busy}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={reason.trim().length < 10}
              onClick={() => call(
                mode === 'hold' ? 'financeWithdrawalReview' : mode === 'reject' ? 'financeWithdrawalApprove' : 'financeWithdrawalFail',
                mode === 'hold' ? { withdrawal_id: id, action: 'hold', reason: reason.trim() }
                  : mode === 'reject' ? { withdrawal_id: id, action: 'reject', reason: reason.trim() }
                  : { withdrawal_id: id, reason: reason.trim() },
                mode === 'hold' ? 'Placed on hold.' : mode === 'reject' ? 'Rejected and returned to the creator’s balance.' : 'Marked as failed.'
              )}>
              {mode === 'hold' ? 'Place on hold' : mode === 'reject' ? 'Reject' : 'Mark failed'}
            </Button>
          </div>
        </div>
      )}

      {mode === 'sent' && (
        <div className="space-y-3 rounded-lg border border-line-strong bg-surface-2 p-4">
          <p className="font-display text-sm font-bold text-ink">Record the transfer you made</p>
          <p className="text-[12px] leading-relaxed text-muted">
            RazeKit does not move money. Make the transfer from the bank yourself, then record its reference here.
            This still does not reduce the creator's balance — confirming does.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label htmlFor="ts-ref">UTR / bank reference *</Label><Input id="ts-ref" value={transfer.payment_reference} onChange={(e) => setTransfer({ ...transfer, payment_reference: e.target.value })} /></div>
            <div><Label htmlFor="ts-date">Transfer date</Label><Input id="ts-date" type="date" value={transfer.transfer_date} onChange={(e) => setTransfer({ ...transfer, transfer_date: e.target.value })} /></div>
            <div><Label htmlFor="ts-method">Method</Label><Input id="ts-method" value={transfer.method} onChange={(e) => setTransfer({ ...transfer, method: e.target.value })} /></div>
            <div><Label htmlFor="ts-note">Note</Label><Input id="ts-note" value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button loading={busy} disabled={transfer.payment_reference.trim().length < 4}
              onClick={() => call('financeWithdrawalTransferSent', { withdrawal_id: id, ...transfer }, 'Transfer recorded. Confirm the payout to close it.')}>
              Confirm transfer sent
            </Button>
          </div>
        </div>
      )}

      {mode === 'confirm' && (
        <Confirm
          title="Confirm payout as completed?"
          warning="This posts the ledger debit and reduces the creator's balance. It can only be undone by a reversal."
          tone="primary"
          rows={[
            { label: 'Creator', value: data.creator?.name },
            { label: 'Amount', value: moneyMinor(w.amount_minor, w.currency), mono: true },
            { label: 'UTR', value: w.payment_reference || '—', mono: true },
            { label: 'Transfer date', value: w.transfer_date || '—' },
            { label: 'Destination', value: data.bank_masked?.account_number_masked || '—', mono: true },
          ]}
          confirmLabel="Confirm payout"
          busy={busy}
          onConfirm={() => call('financeWithdrawalConfirm', { withdrawal_id: id }, 'Payout confirmed and the ledger debit posted.')}
          onCancel={() => setMode(null)}
        >
          {w.approved_by && w.confirmed_by === null && (
            <p className="text-[12px] text-muted">
              Approved by {w.approved_by === undefined ? 'another operator' : 'an operator'}. RazeKit runs with a single
              operator in beta, so approving and confirming the same payout is recorded rather than blocked.
            </p>
          )}
        </Confirm>
      )}

      {data.ledger?.length > 0 && (
        <details className="rounded-md border border-line bg-surface-2 p-3">
          <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wider text-muted">Ledger transactions</summary>
          <ul className="mt-2 space-y-1 text-[12px]">
            {data.ledger.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-muted nums">{t.reference}</span>
                <span className="text-ink">{t.txn_type} · <Money minor={t.amount_minor} /></span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/* ── Ledger ──────────────────────────────────────────────────────────────── */

function LedgerTab() {
  const [accountId, setAccountId] = useState('');
  const { data, error, loading } = useAsync(() => fn('financeLedger', accountId ? { account_id: accountId } : { limit: 60 }), [accountId]);
  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;

  if (accountId && data.account) {
    return (
      <div className="space-y-4">
        <Group title={data.account.account_code} icon={BookOpen}
          actions={<Button size="sm" variant="ghost" onClick={() => setAccountId('')}>Back to all transactions</Button>}>
          <div className="grid sm:grid-cols-3 gap-2">
            <Kpi label="Cached balance" value={moneyMinor(data.cached_balance_minor)} />
            <Kpi label="Replayed from entries" value={moneyMinor(data.replayed_balance_minor)} />
            <Kpi label="Consistent" value={data.consistent ? 'Yes' : 'NO'} tone={data.consistent ? undefined : 'danger'} />
          </div>
          <Table head={['Posted', 'Transaction', 'Type', 'Direction', 'Amount', 'Balance after']}>
            {data.entries.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 text-muted">{dateShort(e.posted_at)}</td>
                <td className="py-2 pr-3 nums text-[12px]">{e.transaction_reference}</td>
                <td className="py-2 pr-3 text-[12px]">{e.entry_type}</td>
                <td className="py-2 pr-3"><Badge tone={e.direction === 'CREDIT' ? 'success' : 'neutral'}>{e.direction}</Badge></td>
                <td className="py-2 pr-3"><Money minor={e.amount_minor} /></td>
                <td className="py-2 pr-3 text-muted"><Money minor={e.balance_after_minor} /></td>
              </tr>
            ))}
          </Table>
        </Group>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Group title="Accounts" icon={Coins}>
        <Table head={['Code', 'Class', 'Owner', 'Balance', '']}>
          {data.accounts.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 text-[12px] nums max-w-[280px] truncate">{a.account_code}</td>
              <td className="py-2 pr-3 text-[12px]">{a.account_class}</td>
              <td className="py-2 pr-3 text-muted text-[12px]">{a.owner_type}</td>
              <td className="py-2 pr-3 font-medium"><Money minor={a.balance_minor} currency={a.currency} /></td>
              <td className="py-2"><Button size="sm" variant="secondary" onClick={() => setAccountId(a.id)}>Entries</Button></td>
            </tr>
          ))}
        </Table>
      </Group>

      <Group title="Recent transactions" icon={BookOpen}>
        <div className="space-y-2">
          {data.transactions.map((t) => (
            <details key={t.id} className="rounded-md border border-line bg-surface-2 p-3">
              <summary className="cursor-pointer flex flex-wrap items-center gap-2 text-[13px]">
                <span className="nums text-[12px] text-muted">{t.reference}</span>
                <span className="font-medium text-ink">{t.txn_type}</span>
                <Money minor={t.amount_minor} currency={t.currency} className="text-ink" />
                <Badge tone={t.balanced ? 'success' : 'danger'}>{t.balanced ? 'balanced' : 'UNBALANCED'}</Badge>
                {t.status === 'REVERSED' && <Badge tone="warning">reversed</Badge>}
                <span className="text-muted">{dateShort(t.posted_at)}</span>
              </summary>
              <ul className="mt-2 space-y-1 text-[12px]">
                {t.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-muted">{e.account_class} · {e.entry_type}</span>
                    <span className={cn('nums', e.direction === 'DEBIT' ? 'text-ink' : 'text-success')}>
                      {e.direction} <Money minor={e.amount_minor} />
                    </span>
                  </li>
                ))}
              </ul>
              {t.description && <p className="mt-2 text-[12px] text-muted">{t.description}</p>}
            </details>
          ))}
        </div>
      </Group>
    </div>
  );
}

/* ── Reconciliation ──────────────────────────────────────────────────────── */

function ReconciliationTab() {
  const { data, error, loading, reload } = useAsync(() => fn('financeReconcile'));
  const [resolving, setResolving] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;

  const resolve = async () => {
    setBusy(true); setFail(null);
    try {
      await fn('financeResolveReconciliation', { reconciliation_id: resolving, notes: notes.trim() });
      setResolving(null); setNotes(''); reload();
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card className={cn('p-4', data.healthy ? 'border-success/30 bg-success/[0.04]' : 'border-danger/30 bg-danger/[0.04]')}>
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          {data.healthy ? <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" /> : <ShieldAlert className="w-4 h-4 text-danger" aria-hidden="true" />}
          {data.healthy ? 'The books are consistent.' : 'The books need attention.'}
        </p>
        <p className="mt-1 text-[12px] text-muted">
          {data.transactions_checked} transactions and {data.accounts_checked} accounts checked at {dateShort(data.checked_at)}.
        </p>
      </Card>

      <div className="grid sm:grid-cols-4 gap-2">
        <Kpi label="Unbalanced" value={data.unbalanced_transactions.length} tone={data.unbalanced_transactions.length ? 'danger' : undefined} />
        <Kpi label="Drifted accounts" value={data.drifted_accounts.length} tone={data.drifted_accounts.length ? 'danger' : undefined} />
        <Kpi label="Funding without ledger" value={data.verified_funding_without_ledger.length} tone={data.verified_funding_without_ledger.length ? 'danger' : undefined} />
        <Kpi label="Payouts without ledger" value={data.paid_withdrawals_without_ledger.length} tone={data.paid_withdrawals_without_ledger.length ? 'danger' : undefined} />
      </div>

      <Group title="Reconciliation records" icon={Scale} actions={<Button size="sm" variant="ghost" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Re-run</Button>}>
        <Err error={fail} />
        <Table head={['Reference', 'Status', 'Expected', 'Actual', 'Difference', 'Checked', '']}>
          {data.records.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 nums text-[12px]">{r.internal_ref}</td>
              <td className="py-2 pr-3">
                <Badge tone={r.status === 'MATCHED' || r.status === 'RESOLVED' ? 'success' : r.status === 'OVERPAID' ? 'primary' : 'danger'}>{r.status}</Badge>
              </td>
              <td className="py-2 pr-3"><Money minor={r.expected_amount_minor} /></td>
              <td className="py-2 pr-3"><Money minor={r.actual_amount_minor} /></td>
              <td className="py-2 pr-3"><Money minor={r.difference_minor} /></td>
              <td className="py-2 pr-3 text-muted">{r.checked_at ? dateShort(r.checked_at) : '—'}</td>
              <td className="py-2">
                {!['MATCHED', 'RESOLVED'].includes(r.status) && (
                  <Button size="sm" variant="secondary" onClick={() => setResolving(resolving === r.id ? null : r.id)}>Resolve</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {data.records.length === 0 && <p className="py-6 text-center text-sm text-muted">No reconciliation records yet.</p>}

        {resolving && (
          <div className="space-y-3 rounded-lg border border-line-strong bg-surface-2 p-4">
            <Label htmlFor="rc-notes">How was this difference resolved? * (min 10 characters)</Label>
            <textarea id="rc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setResolving(null)} disabled={busy}>Cancel</Button>
              <Button loading={busy} disabled={notes.trim().length < 10} onClick={resolve}>Mark resolved</Button>
            </div>
          </div>
        )}
      </Group>
    </div>
  );
}

/* ── Refunds ─────────────────────────────────────────────────────────────── */

function RefundsTab() {
  const { data, error, loading, reload } = useAsync(() => fn('financeFundingQueue', { all: true }));
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({ reason: '', amount: '', refund_fees: false, payment_reference: '' });
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  const [done, setDone] = useState('');

  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;

  const refundable = data.queue.filter((f) => ['VERIFIED', 'OVERPAID', 'PARTIAL'].includes(f.status));
  const pending = data.queue.filter((f) => f.status === 'REFUND_PENDING');

  const act = async (fundingId, action) => {
    setBusy(true); setFail(null);
    try {
      await fn('financeRefund', {
        funding_id: fundingId, action, reason: form.reason.trim(),
        amount: action === 'approve' && form.amount ? Number(form.amount) : undefined,
        refund_fees: action === 'approve' ? form.refund_fees : undefined,
        payment_reference: action === 'record' ? form.payment_reference.trim() : undefined,
      });
      setDone(action === 'approve' ? 'Refund approved and moved to the clearing account.' : 'Refund recorded as transferred.');
      setTarget(null); setForm({ reason: '', amount: '', refund_fees: false, payment_reference: '' });
      setTimeout(reload, 1000);
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Ok>{done}</Ok>
      <Err error={fail} />

      <Group title={`Approved refunds awaiting transfer (${pending.length})`} icon={RefreshCw}>
        {pending.length === 0 ? <p className="py-4 text-center text-sm text-muted">Nothing waiting to be transferred.</p> : (
          <Table head={['Reference', 'Client', 'Amount', '']}>
            {pending.map((f) => (
              <tr key={f.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 nums text-[12px]">{f.reference}</td>
                <td className="py-2 pr-3">{f.client_name}</td>
                <td className="py-2 pr-3"><Money minor={f.refund_amount_minor ?? f.total_amount_minor} currency={f.currency} /></td>
                <td className="py-2"><Button size="sm" variant="secondary" onClick={() => setTarget({ id: f.id, action: 'record', row: f })}>Record transfer</Button></td>
              </tr>
            ))}
          </Table>
        )}
      </Group>

      <Group title={`Refundable funding (${refundable.length})`} icon={Banknote}>
        <p className="text-[12px] text-muted">
          A prize can no longer be refunded once a winner has been finalised — that money is owed to the creator.
        </p>
        <Table head={['Reference', 'Client', 'Contest', 'Amount', 'Status', '']}>
          {refundable.map((f) => (
            <tr key={f.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 nums text-[12px]">{f.reference}</td>
              <td className="py-2 pr-3">{f.client_name}</td>
              <td className="py-2 pr-3 max-w-[200px] truncate">{f.contest_title || '—'}</td>
              <td className="py-2 pr-3"><Money minor={f.total_amount_minor} currency={f.currency} /></td>
              <td className="py-2 pr-3"><Badge tone={TONE[f.status_tone] || 'neutral'}>{f.status_label}</Badge></td>
              <td className="py-2"><Button size="sm" variant="danger" onClick={() => setTarget({ id: f.id, action: 'approve', row: f })}>Refund</Button></td>
            </tr>
          ))}
        </Table>
        {refundable.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing is currently refundable.</p>}
      </Group>

      {target && (
        <Card className="p-5 space-y-3">
          <p className="font-display text-sm font-bold text-ink">
            {target.action === 'approve' ? 'Approve refund' : 'Record refund transfer'} — {target.row.reference}
          </p>
          <div>
            <Label htmlFor="rf-reason">Reason * (min 10 characters)</Label>
            <textarea id="rf-reason" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          {target.action === 'approve' ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rf-amt">Amount (blank = full client balance)</Label>
                <Input id="rf-amt" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink self-end pb-2">
                <input type="checkbox" checked={form.refund_fees} onChange={(e) => setForm({ ...form, refund_fees: e.target.checked })} />
                Also refund the platform fee and tax
              </label>
            </div>
          ) : (
            <div>
              <Label htmlFor="rf-ref">Bank reference for the refund transfer *</Label>
              <Input id="rf-ref" value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} />
            </div>
          )}
          <Confirm
            title={target.action === 'approve' ? 'Confirm refund approval' : 'Confirm refund recorded'}
            warning={target.action === 'approve'
              ? 'This releases the prize commitment and moves the money to the refund clearing account.'
              : 'This settles the refund against the bank. Make the transfer first.'}
            tone="danger"
            rows={[
              { label: 'Client', value: target.row.client_name },
              { label: 'Funding', value: target.row.reference, mono: true },
              { label: 'Amount', value: target.action === 'approve' && form.amount ? moneyMinor(Number(form.amount) * 100) : moneyMinor(target.row.refund_amount_minor ?? target.row.total_amount_minor), mono: true },
            ]}
            confirmLabel={target.action === 'approve' ? 'Approve refund' : 'Record refund'}
            busy={busy}
            onConfirm={() => act(target.id, target.action)}
            onCancel={() => setTarget(null)}
          />
        </Card>
      )}
    </div>
  );
}

/* ── Payment settings ────────────────────────────────────────────────────── */

function SettingsTab() {
  const { data, error, loading, reload } = useAsync(() => fn('paymentSettingsGet'));
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null);
  const [done, setDone] = useState('');
  const [revealed, setRevealed] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [file, setFile] = useState(null);
  // Hooks must run in the same order on every render, so this sits above the
  // loading/error early-returns rather than after them.
  const gate = useGate(data?.permissions);

  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setForm({
      bank_account_name: s.bank_account_name || '',
      bank_name: s.bank_name?.split(' - ')[0] || '',
      bank_branch: s.bank_name?.split(' - ')[1] || '',
      bank_account_number: '',
      bank_ifsc: '',
      upi_id: '',
      payment_instructions: s.payment_instructions || '',
      support_phone: s.support_phone || '',
      support_email: s.support_email || '',
      verification_hours: s.verification_hours || 24,
    });
  }, [data?.settings?.version]);

  if (loading || !form) return <Skeleton className="h-96 rounded-lg" />;
  if (error) return <Err error={error} />;
  const s = data.settings;
  const canManage = gate('finance.manage_permissions');

  const save = async (patch, reason) => {
    setBusy(true); setFail(null); setDone('');
    try {
      const r = await fn('paymentSettingsUpdate', { ...patch, reason });
      setDone(r.unchanged ? 'Nothing changed.' : `Saved as version ${r.settings.version}.`);
      reload();
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  const toggle = (key, value, label) =>
    save({ [key]: value }, `${value ? 'Enabled' : 'Disabled'} ${label}`);

  const reveal = async () => {
    setBusy(true); setFail(null);
    try {
      const r = await fn('paymentSettingsGet', { reveal: true });
      setRevealed(r.revealed);
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  const uploadQr = async () => {
    if (!file) return;
    setBusy(true); setFail(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${api.BASE}/api/payments/settings/qr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${api.token.get()}` },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Upload failed');
      setDone(body.message || 'QR uploaded.');
      setFile(null);
      reload();
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  const removeQr = async () => {
    setBusy(true); setFail(null);
    try {
      const r = await fn('paymentSettingsQr', { action: 'remove', reason: 'Removed from Payment settings' });
      setDone(r.message);
      setConfirmRemove(false);
      reload();
    } catch (e) { setFail(e); } finally { setBusy(false); }
  };

  const Method = ({ label, enabled, available, onToggle, note }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {note && <p className="text-[11px] text-muted">{note}</p>}
        {enabled && !available && <p className="text-[11px] text-danger">Enabled but not configured — clients will not see it.</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={available ? 'success' : enabled ? 'warning' : 'neutral'}>
          {available ? 'ENABLED' : enabled ? 'INCOMPLETE' : 'DISABLED'}
        </Badge>
        <Button size="sm" variant={enabled ? 'secondary' : 'primary'} loading={busy}
          disabled={!canManage.allowed} title={canManage.title} onClick={onToggle}>
          {enabled ? 'Disable' : 'Enable'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Ok>{done}</Ok>
      <Err error={fail} />

      <Card className="p-4 bg-surface-2 border-line-strong">
        <p className="text-[13px] leading-relaxed text-ink">
          These details are shown only to an authenticated client with an active funding request. They are never in
          the frontend source, a public endpoint, or git. Every change creates a new version — nothing is overwritten.
        </p>
        <p className="mt-1 text-[12px] text-muted">Current version: {s.version}</p>
      </Card>

      <Group title="Payment methods" icon={CreditCard}>
        <Method label="Manual bank transfer" enabled={s.methods.bank_transfer.enabled} available={s.methods.bank_transfer.available}
          onToggle={() => toggle('bank_transfer_enabled', !s.methods.bank_transfer.enabled, 'bank transfer')} />
        <Method label="UPI" enabled={s.methods.upi.enabled} available={s.methods.upi.available}
          note={s.upi_id_masked ? `UPI ID ${s.upi_id_masked}` : 'No UPI ID configured'}
          onToggle={() => toggle('upi_enabled', !s.methods.upi.enabled, 'UPI')} />
        <Method label="UPI QR" enabled={s.methods.upi_qr.enabled} available={s.methods.upi_qr.available}
          note={data.qr ? `Version ${data.qr.version}, uploaded ${dateShort(data.qr.uploaded_at)}` : 'No QR uploaded'}
          onToggle={() => toggle('upi_qr_enabled', !s.methods.upi_qr.enabled, 'UPI QR')} />
        <p className="text-[11px] leading-relaxed text-muted">
          Disabling a method hides it from new funding flows. It deletes nothing: existing transactions, proofs and
          ledger entries are untouched.
        </p>
      </Group>

      <Group title="Destination account" icon={Landmark}>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px] mb-2">
          <div className="flex justify-between gap-3"><dt className="text-muted">Account</dt><dd className="text-ink nums">{revealed?.bank_account_number || s.bank_account_number_masked || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">IFSC</dt><dd className="text-ink nums">{revealed?.bank_ifsc || s.bank_ifsc_masked || '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">UPI ID</dt><dd className="text-ink nums">{revealed?.upi_id || s.upi_id_masked || '—'}</dd></div>
        </dl>
        {!revealed && (
          <Button size="sm" variant="secondary" loading={busy} onClick={reveal}>
            <Eye className="w-3.5 h-3.5" /> Reveal full details (logged)
          </Button>
        )}

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <div><Label htmlFor="ps-name">Account holder name</Label><Input id="ps-name" value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} /></div>
          <div><Label htmlFor="ps-bank">Bank</Label><Input id="ps-bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
          <div><Label htmlFor="ps-branch">Branch</Label><Input id="ps-branch" value={form.bank_branch} onChange={(e) => setForm({ ...form, bank_branch: e.target.value })} /></div>
          <div><Label htmlFor="ps-acc">New account number (blank = unchanged)</Label><Input id="ps-acc" value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} placeholder="6–20 digits" /></div>
          <div><Label htmlFor="ps-ifsc">New IFSC (blank = unchanged)</Label><Input id="ps-ifsc" value={form.bank_ifsc} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })} placeholder="e.g. ABCD0123456" /></div>
          <div><Label htmlFor="ps-upi">New UPI ID (blank = unchanged)</Label><Input id="ps-upi" value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="name@bank" /></div>
          <div><Label htmlFor="ps-phone">Support phone</Label><Input id="ps-phone" value={form.support_phone} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} /></div>
          <div><Label htmlFor="ps-email">Support email</Label><Input id="ps-email" type="email" value={form.support_email} onChange={(e) => setForm({ ...form, support_email: e.target.value })} /></div>
          <div><Label htmlFor="ps-hours">Stated verification window (hours)</Label><Input id="ps-hours" type="number" min="1" max="336" value={form.verification_hours} onChange={(e) => setForm({ ...form, verification_hours: e.target.value })} /></div>
        </div>
        <div>
          <Label htmlFor="ps-instr">Payment instructions shown to clients</Label>
          <textarea id="ps-instr" rows={3} value={form.payment_instructions} onChange={(e) => setForm({ ...form, payment_instructions: e.target.value })}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <Button loading={busy} disabled={!canManage.allowed} title={canManage.title}
          onClick={() => save(
            Object.fromEntries(Object.entries({
              bank_account_name: form.bank_account_name,
              bank_name: form.bank_name,
              bank_branch: form.bank_branch,
              bank_account_number: form.bank_account_number || undefined,
              bank_ifsc: form.bank_ifsc || undefined,
              upi_id: form.upi_id || undefined,
              payment_instructions: form.payment_instructions,
              support_phone: form.support_phone,
              support_email: form.support_email,
              verification_hours: Number(form.verification_hours),
            }).filter(([, v]) => v !== undefined)),
            'Payment settings updated from the admin console'
          )}>
          Save as new version
        </Button>
      </Group>

      <Group title="UPI QR code" icon={CreditCard}>
        {data.qr?.preview_url ? (
          <div className="flex flex-wrap items-start gap-4">
            <img src={data.qr.preview_url} alt={`Current UPI QR code, version ${data.qr.version}`} className="w-[180px] rounded-md border border-line" />
            <div className="text-[13px] space-y-1">
              <p className="text-ink">Version {data.qr.version}</p>
              <p className="text-muted">{dateShort(data.qr.uploaded_at)} · {Math.round((data.qr.size_bytes || 0) / 1024)} KB</p>
              <Button size="sm" variant="danger" disabled={!canManage.allowed} title={canManage.title} onClick={() => setConfirmRemove(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Remove QR
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted">No QR code uploaded.</p>
        )}

        {confirmRemove && (
          <Confirm
            title="Remove UPI QR code?"
            warning="New funding requests will no longer see this QR code. Existing transaction history will remain unchanged."
            confirmLabel="Remove QR"
            tone="danger"
            busy={busy}
            onConfirm={removeQr}
            onCancel={() => setConfirmRemove(false)}
          />
        )}

        <div className="pt-2 space-y-2">
          <Label htmlFor="qr-file">{data.qr ? 'Replace QR code' : 'Upload QR code'} (PNG, JPEG or WebP, max 5 MB)</Label>
          <input id="qr-file" type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-ink" />
          <Button size="sm" loading={busy} disabled={!file || !canManage.allowed} title={canManage.title} onClick={uploadQr}>
            Upload
          </Button>
          <p className="text-[11px] text-muted">
            Replacing keeps the previous version. A funding request issued under an earlier QR stays explainable.
          </p>
        </div>

        {data.qr_versions?.length > 0 && (
          <details className="rounded-md border border-line bg-surface-2 p-3">
            <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wider text-muted">Version history</summary>
            <ul className="mt-2 space-y-1 text-[12px]">
              {data.qr_versions.map((v) => (
                <li key={v.version} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink">v{v.version} {v.active && <Badge tone="success">active</Badge>}</span>
                  <span className="text-muted">{dateShort(v.uploaded_at)}{v.retired_at ? ` · retired ${dateShort(v.retired_at)}` : ''}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Group>

      {data.history?.length > 0 && (
        <Group title="Settings history" icon={ClipboardList}>
          <ul className="space-y-1 text-[12px]">
            {data.history.map((h) => (
              <li key={h.version} className="flex flex-wrap justify-between gap-2">
                <span className="text-ink">v{h.version} {h.active && <Badge tone="success">active</Badge>}</span>
                <span className="text-muted">{h.change_reason || '—'} · {dateShort(h.created_date)}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </div>
  );
}

/* ── Financial audit ─────────────────────────────────────────────────────── */

function AuditTab() {
  const [filters, setFilters] = useState({ action: '', from: '', to: '' });
  const [applied, setApplied] = useState({});
  const { data, error, loading } = useAsync(() => fn('financeAudit', applied), [JSON.stringify(applied)]);

  return (
    <div className="space-y-4">
      <Group title="Filters" icon={Search}>
        <div className="grid sm:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="fa-action">Action</Label>
            <select id="fa-action" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="w-full h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink">
              <option value="">All</option>
              {(data?.actions || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div><Label htmlFor="fa-from">From</Label><Input id="fa-from" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><Label htmlFor="fa-to">To</Label><Input id="fa-to" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          <div className="self-end"><Button size="sm" onClick={() => setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))}>Apply</Button></div>
        </div>
      </Group>

      {loading ? <Skeleton className="h-64 rounded-lg" /> : error ? <Err error={error} /> : (
        <Group title={`Financial audit (${data.count})`} icon={FileText}>
          <p className="text-[12px] text-muted">Append-only. Financial history is never deleted.</p>
          <Table head={['When', 'Action', 'Actor', 'Amount', 'Reference', 'Status', 'Reason']}>
            {data.events.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0 align-top">
                <td className="py-2 pr-3 text-muted whitespace-nowrap">{dateShort(e.created_date)}</td>
                <td className="py-2 pr-3 text-[12px] font-medium text-ink">{e.action}</td>
                <td className="py-2 pr-3">{e.actor_name}</td>
                <td className="py-2 pr-3">{e.amount_minor != null ? <Money minor={e.amount_minor} currency={e.currency || 'INR'} /> : '—'}</td>
                <td className="py-2 pr-3 nums text-[12px]">{e.reference || '—'}</td>
                <td className="py-2 pr-3">
                  <Badge tone={e.status === 'success' ? 'success' : e.status === 'blocked' ? 'warning' : 'danger'}>{e.status}</Badge>
                </td>
                <td className="py-2 pr-3 text-muted max-w-[280px]">{e.reason || '—'}</td>
              </tr>
            ))}
          </Table>
          {data.events.length === 0 && <p className="py-6 text-center text-sm text-muted">No financial events match those filters.</p>}
        </Group>
      )}
    </div>
  );
}

/* ── Payout processing (per-contest prize eligibility) ───────────────────── */

function PayoutsTab() {
  const { data, error, loading } = useAsync(() => fn('financePayoutQueue'));
  if (loading) return <Skeleton className="h-64 rounded-lg" />;
  if (error) return <Err error={error} />;
  return (
    <Group title={`Prize payouts (${data.count})`} icon={Coins}>
      <p className="text-[12px] leading-relaxed text-muted">
        One row per contest win. A prize becomes part of the creator's balance when it is eligible; the actual bank
        transfer happens through a withdrawal request.
      </p>
      <Table head={['Reference', 'Creator', 'Contest', 'Amount', 'Status']}>
        {data.queue.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-0">
            <td className="py-2 pr-3 nums text-[12px]">{p.reference}</td>
            <td className="py-2 pr-3">{p.creator_name}</td>
            <td className="py-2 pr-3 max-w-[220px] truncate">{p.contest_title || '—'}</td>
            <td className="py-2 pr-3"><Money minor={p.amount_minor} currency={p.currency} /></td>
            <td className="py-2 pr-3"><Badge tone={TONE[p.status_tone] || 'neutral'}>{p.status_label}</Badge></td>
          </tr>
        ))}
      </Table>
      {data.queue.length === 0 && <p className="py-6 text-center text-sm text-muted">No prize payouts are in progress.</p>}
    </Group>
  );
}

/* ── Shell ───────────────────────────────────────────────────────────────── */

export default function Finance() {
  const [tab, setTab] = useState('overview');
  const body = useMemo(() => {
    switch (tab) {
      case 'overview': return <OverviewTab onJump={setTab} />;
      case 'verification': return <VerificationTab />;
      case 'funding': return <FundingTab />;
      case 'balances': return <BalancesTab />;
      case 'commitments': return <CommitmentsTab />;
      case 'withdrawals': return <WithdrawalsTab />;
      case 'payouts': return <PayoutsTab />;
      case 'ledger': return <LedgerTab />;
      case 'reconciliation': return <ReconciliationTab />;
      case 'refunds': return <RefundsTab />;
      case 'settings': return <SettingsTab />;
      case 'audit': return <AuditTab />;
      default: return null;
    }
  }, [tab]);

  return (
    <div className="space-y-5">
      <Card className="p-4 bg-ink text-white border-ink">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Landmark className="w-4 h-4" aria-hidden="true" /> RazeKit Beta — payments are processed manually
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-white/70">
          No payment gateway is connected. A client's transfer becomes money only when you verify it against the bank
          statement, and a creator's balance drops only when you confirm a transfer you actually made.
        </p>
      </Card>

      {/* Twelve tabs is a lot for one row; let it scroll rather than wrap badly. */}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <Segmented tabs={TABS} value={tab} onChange={setTab} size="sm" />
      </div>

      {body}
    </div>
  );
}
