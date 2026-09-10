// RazeKit balance — the money page for both creators and clients.
//
// Every figure here is read from the server's ledger-derived balance. Nothing on
// this screen implies an automated, instant, guaranteed or protected transfer,
// because during the beta none of that is true: a person prepares each transfer
// and confirms it afterwards.
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Clock, Coins,
  Landmark, LifeBuoy, Lock, Receipt, Trophy,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { moneyMinor, dateShort } from '@/lib/format';
import { PageHeader, Card, Button, Input, Label, Badge, Skeleton, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const BETA_NOTICE =
  'RazeKit Beta — Automated payment processing is coming soon. During the beta, selected contest funding and payouts are processed manually with verification.';

const msgOf = (e, fallback) => e?.data?.error?.message || e?.message || fallback;
const codeOf = (e) => e?.data?.error?.code || '';

// Server error codes mapped to the field they belong next to, so an error is
// never stranded at the top of a form away from the input that caused it.
const BANK_FIELD = {
  HOLDER_REQUIRED: 'account_holder_name', ACCOUNT_NUMBER_INVALID: 'account_number',
  ACCOUNT_NUMBER_MISMATCH: 'confirm_account_number', IFSC_INVALID: 'ifsc', UPI_INVALID: 'upi_id',
};
const WD_FIELD = {
  AMOUNT_REQUIRED: 'amount', BELOW_MINIMUM: 'amount', INSUFFICIENT_BALANCE: 'amount',
  ACCOUNT_CONFIRMATION_FAILED: 'confirm_last4',
};

const FIGURES = [
  { key: 'total', label: 'Total balance', field: 'total_minor', icon: Coins },
  { key: 'available', label: 'Available', field: 'available_minor', icon: CheckCircle2 },
  { key: 'reserved', label: 'Reserved', field: 'reserved_minor', icon: Lock },
  { key: 'pending', label: 'Pending', field: 'pending_minor', icon: Clock },
  { key: 'withdrawable', label: 'Withdrawable', field: 'withdrawable_minor', icon: Banknote },
];

const BANK_FIELDS = [
  { name: 'account_holder_name', label: 'Account holder name', hint: 'Exactly as it appears on the account.', autoComplete: 'name' },
  { name: 'bank_name', label: 'Bank name', hint: 'Optional, but it helps us check the transfer.' },
  { name: 'account_number', label: 'Account number', hint: '6–20 digits, no spaces.', inputMode: 'numeric' },
  { name: 'confirm_account_number', label: 'Confirm account number', hint: 'Type it again — we compare the two.', inputMode: 'numeric' },
  { name: 'ifsc', label: 'IFSC code', hint: 'For example HDFC0001234.' },
  { name: 'upi_id', label: 'UPI ID (optional)', hint: 'For example name@bank.' },
];

const CANCELLABLE = ['REQUESTED', 'UNDER_REVIEW', 'ON_HOLD'];

/* ── small building blocks ─────────────────────────────────────────────────── */
/** One labelled input: a visible label, helper text, and its own error message. */
function TextField({ id, label, hint, error, value, onChange, ...props }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {hint && <p id={`${id}-hint`} className="-mt-1 mb-1.5 text-xs text-muted">{hint}</p>}
      <Input id={id} className="h-11" value={value} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={cn(hint && `${id}-hint`, error && `${id}-error`) || undefined} {...props} />
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}

const Alert = ({ children }) => (
  <p role="alert" className="rounded-md bg-danger/8 px-3 py-2 text-sm font-medium text-danger">{children}</p>
);

function Section({ title, description, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-[13px] text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const BetaCallout = () => (
  <Card className="flex items-start gap-3 border-warning/25 bg-warning/[0.06] p-4">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
    <p className="text-[13px] leading-relaxed text-ink">{BETA_NOTICE}</p>
  </Card>
);

const BalanceSkeleton = () => (
  <div className="space-y-6">
    <div className="space-y-2"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-96 max-w-full" /></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Skeleton className="h-40 rounded-lg" /><Skeleton className="h-72 rounded-lg" />
    </div>
    <Skeleton className="h-16 rounded-lg" /><Skeleton className="h-64 rounded-lg" />
  </div>
);

/** A compact list row used for withdrawals, funding and reservations. */
const RowList = ({ items }) => (
  <Card className="overflow-hidden">
    <ul className="divide-y divide-line">
      {items.map((it) => (
        <li key={it.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{it.title}</p>
            <p className="truncate text-xs text-muted">{it.meta}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-display text-sm font-extrabold text-ink nums">{it.amount}</span>
            {it.badge && <Badge tone={it.badgeTone || 'neutral'}>{it.badge}</Badge>}
          </div>
        </li>
      ))}
    </ul>
  </Card>
);

/* ── balance overview ──────────────────────────────────────────────────────── */
function Overview({ balance, isClient }) {
  const defs = balance.definitions || {};
  // The one number that decides what this person can do next.
  const hero = FIGURES.find((f) => f.key === (isClient ? 'reserved' : 'available'));
  const HeroIcon = hero.icon;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="border-ink bg-ink p-6 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">
          <HeroIcon className="h-4 w-4" aria-hidden="true" />{hero.label}
        </p>
        <p className="mt-2 font-display text-[34px] font-extrabold leading-none nums">{moneyMinor(balance[hero.field], balance.currency)}</p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-white/70">{defs[hero.key]}</p>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-base font-bold text-ink">Balance breakdown</h2>
        <p className="mt-0.5 text-[13px] text-muted">What each figure means, so no number on this page needs guessing.</p>
        <dl className="mt-4 divide-y divide-line">
          {FIGURES.map(({ key, label, field, icon: Icon }) => (
            <div key={key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
              <div className="min-w-0 max-w-md">
                <dt className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />{label}
                </dt>
                {defs[key] && <p className="mt-0.5 text-xs leading-relaxed text-muted">{defs[key]}</p>}
              </div>
              <dd className="font-display text-lg font-extrabold text-ink nums">{moneyMinor(balance[field], balance.currency)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-md bg-surface-2 px-3 py-3">
          <div className="min-w-0 max-w-md">
            <p className="text-sm font-semibold text-ink">Paid out (history)</p>
            {defs.paid_out && <p className="mt-0.5 text-xs leading-relaxed text-muted">{defs.paid_out}</p>}
          </div>
          <p className="font-display text-lg font-extrabold text-ink nums">{moneyMinor(balance.paid_out_minor, balance.currency)}</p>
        </div>
      </Card>
    </div>
  );
}

/* ── creator: bank details ─────────────────────────────────────────────────── */
function BankDetailsForm({ onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(BANK_FIELDS.map((f) => [f.name, ''])));
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); setErrs((p) => ({ ...p, [k]: '' })); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrs({}); setFormErr('');
    try {
      await fn('payoutAccountSave', form);
      await onSaved();
    } catch (ex) {
      const field = BANK_FIELD[codeOf(ex)];
      if (field) setErrs({ [field]: msgOf(ex, 'Check this value.') });
      else setFormErr(msgOf(ex, 'Your details could not be saved. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <Card as="form" onSubmit={submit} className="space-y-4 p-5 sm:p-6" noValidate>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-primary">
          <Landmark className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-base font-bold text-ink">Add your bank account</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            Someone on the RazeKit team makes the transfer to this account by hand and confirms it afterwards. Enter the
            details exactly as your bank has them — a typo here sends money to the wrong account.
          </p>
        </div>
      </div>

      {formErr && <Alert>{formErr}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        {BANK_FIELDS.map(({ name, label, hint, ...rest }) => (
          <TextField key={name} id={`bank-${name}`} label={label} hint={hint} value={form[name]}
            onChange={set(name)} error={errs[name]} {...rest} />
        ))}
      </div>

      <Button type="submit" size="lg" loading={busy}>Save bank details</Button>
    </Card>
  );
}

/* ── creator: the request that is already open ─────────────────────────────── */
function OpenRequest({ request, currency, onCancelled }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amount = moneyMinor(request.amount_minor, request.currency || currency);

  const cancel = async () => {
    setBusy(true); setErr('');
    try {
      await fn('withdrawalCancel', { withdrawal_id: request.id, reason: 'Cancelled by creator' });
      setConfirming(false);
      await onCancelled();
    } catch (e) { setErr(msgOf(e, 'The request could not be cancelled. Nothing was changed.')); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-bold text-ink">Withdrawal request in progress</h3>
        <Badge tone={request.status_tone || 'primary'}>{request.status_label || request.status}</Badge>
      </div>
      <p className="mt-1 text-[13px] text-muted">{request.status_detail || 'Your request is with the RazeKit finance team.'}</p>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
        {[['Amount', amount], ['Reference', request.reference], ['Requested', dateShort(request.requested_at)],
          ['To account', request.bank_account_masked || '—']].map(([k, v]) => (
          <div key={k} className="flex gap-2"><dt className="text-muted">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
        ))}
      </dl>

      <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-muted">
        This amount is held on your balance as <span className="font-semibold text-ink">Pending</span>. Requesting a
        withdrawal does not reduce your balance — it only goes down once the transfer is made and confirmed.
      </p>

      {err && <div className="mt-3"><Alert>{err}</Alert></div>}

      {CANCELLABLE.includes(request.status) && (
        <div className="mt-4">
          {confirming ? (
            <div className="rounded-md border border-line-strong bg-surface-2 p-4">
              <p className="text-sm text-ink">
                Cancel the request for <span className="font-bold nums">{amount}</span> to{' '}
                <span className="font-bold">{request.bank_account_masked || 'your saved account'}</span>? The amount goes
                straight back to your available balance.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" size="lg" loading={busy} onClick={cancel}>Yes, cancel the request</Button>
                <Button variant="secondary" size="lg" onClick={() => setConfirming(false)} disabled={busy}>Keep it</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="lg" onClick={() => setConfirming(true)}>Cancel this request</Button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── creator: request a withdrawal ─────────────────────────────────────────── */
function RequestForm({ balance, account, disabled, onDone }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [last4, setLast4] = useState('');
  const [stage, setStage] = useState('form');
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAmount(String(Math.max(0, Number(balance.withdrawable_minor || 0)) / 100)); }, [balance.withdrawable_minor]);

  // Checked here as well as on the server, so the minimum and the ceiling are
  // never a surprise that only appears after submitting.
  const review = (e) => {
    e.preventDefault();
    setErrs({}); setFormErr('');
    const minor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(minor) || minor <= 0) return setErrs({ amount: 'Enter the amount you want to withdraw.' });
    if (minor < Number(balance.min_withdrawal_minor || 0)) {
      return setErrs({ amount: `The minimum withdrawal is ${moneyMinor(balance.min_withdrawal_minor, balance.currency)}.` });
    }
    if (minor > Number(balance.withdrawable_minor || 0)) {
      return setErrs({ amount: `You can request up to ${moneyMinor(balance.withdrawable_minor, balance.currency)} today.` });
    }
    return setStage('confirm');
  };

  const submit = async () => {
    setBusy(true); setErrs({}); setFormErr('');
    try {
      await fn('withdrawalRequest', { amount: Number(amount), confirm_account_last4: last4.trim(), note: note.trim() });
      setNote(''); setLast4('');
      await onDone('Your withdrawal request has been sent to the RazeKit finance team for manual review.');
    } catch (e) {
      const field = WD_FIELD[codeOf(e)];
      if (field) setErrs({ [field]: msgOf(e, 'Check this value.') });
      else setFormErr(msgOf(e, 'Your request could not be created. Nothing was changed on your balance.'));
    } finally { setBusy(false); setStage('form'); }
  };

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="font-display text-base font-bold text-ink">Request a withdrawal</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
        A RazeKit team member reviews the request, makes the bank transfer by hand, then records the transfer reference
        here. Requesting does not reduce your balance — the amount stays yours, marked Pending, until the transfer is
        made and confirmed.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {[['You can request today', moneyMinor(balance.withdrawable_minor, balance.currency)],
          ['Minimum withdrawal', moneyMinor(balance.min_withdrawal_minor, balance.currency)],
          ['Paying into', account?.account_number_masked || 'No account yet']].map(([label, value]) => (
          <div key={label} className="rounded-md bg-surface-2 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-0.5 text-sm font-bold text-ink nums">{value}</dd>
          </div>
        ))}
      </dl>

      {account && (
        <p className="mt-3 text-xs text-muted">
          {account.account_holder_name}{account.bank_name ? ` · ${account.bank_name}` : ''}
          {account.ifsc_masked ? ` · IFSC ${account.ifsc_masked}` : ''}
          {account.verified ? ' · verified by RazeKit' : ' · not yet verified by RazeKit'}
        </p>
      )}

      {formErr && <div className="mt-4"><Alert>{formErr}</Alert></div>}

      {disabled ? (
        <p className="mt-4 rounded-md border border-line-strong bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
          You can have one withdrawal request open at a time. The current one has to finish before you start another.
        </p>
      ) : stage === 'form' ? (
        <form className="mt-4 space-y-4" onSubmit={review} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="wd-amount" label={`Amount (${balance.currency || 'INR'})`} value={amount} onChange={setAmount}
              error={errs.amount} inputMode="decimal" type="number" step="1"
              hint={`Between ${moneyMinor(balance.min_withdrawal_minor, balance.currency)} and ${moneyMinor(balance.withdrawable_minor, balance.currency)}.`} />
            <TextField id="wd-note" label="Note for the finance team (optional)" value={note} onChange={setNote}
              error={errs.note} maxLength={500} hint="Anything we should know about this transfer." />
          </div>
          <Button type="submit" size="lg">Review request</Button>
        </form>
      ) : (
        <div className="mt-4 rounded-md border border-line-strong bg-surface-2 p-4">
          <h4 className="font-display text-sm font-bold text-ink">Check this before you send it</h4>
          <dl className="mt-3 space-y-1.5 text-sm">
            {[['Amount', moneyMinor(Math.round(Number(amount) * 100), balance.currency)],
              ['To account', account?.account_number_masked || '—'],
              ['Account holder', account?.account_holder_name || '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted">{k}</dt><dd className="font-display font-extrabold text-ink nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <TextField id="wd-last4" label="Type the last 4 digits of that account" value={last4} onChange={setLast4}
              error={errs.confirm_last4} inputMode="numeric" maxLength={4}
              hint="One last check that the money is going where you expect." />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="lg" loading={busy} onClick={submit} disabled={last4.trim().length !== 4}>Send withdrawal request</Button>
            <Button variant="secondary" size="lg" onClick={() => setStage('form')} disabled={busy}>Back</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── transaction history ───────────────────────────────────────────────────── */
function Transactions({ rows, currency }) {
  if (!rows?.length) {
    return <EmptyState icon={Receipt} title="No transactions yet"
      description="Every movement on your balance will be listed here with its own reference." />;
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              {['Date', 'Type', 'Contest', 'Reference'].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 font-semibold">{h}</th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((t, i) => {
              const up = Number(t.amount_minor) >= 0;
              const Icon = up ? ArrowDownLeft : ArrowUpRight;
              return (
                <tr key={`${t.reference || 'txn'}-${i}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{dateShort(t.date)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{t.type}</span>
                    {t.description && <span className="block text-xs text-muted">{t.description}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{t.contest_title || '—'}</td>
                  <td className="px-4 py-3 font-medium text-muted">{t.reference || '—'}</td>
                  <td className={cn('whitespace-nowrap px-4 py-3 text-right font-display font-extrabold nums', up ? 'text-success' : 'text-danger')}>
                    <span className="inline-flex items-center justify-end gap-1">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">{up ? 'Money in' : 'Money out'}</span>
                      {up ? '+' : '−'}{moneyMinor(Math.abs(Number(t.amount_minor || 0)), t.currency || currency)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── page ──────────────────────────────────────────────────────────────────── */
export default function Balance() {
  const [data, setData] = useState(null);
  const [wd, setWd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true);
    try {
      const overview = await fn('balanceOverview', {});
      setData(overview);
      // Only creators withdraw; withdrawalList carries the request ids and the
      // masked account that the overview deliberately leaves out.
      setWd(overview?.role === 'creator' ? await fn('withdrawalList', {}).catch(() => null) : null);
      setLoadErr('');
    } catch (e) {
      setLoadErr(msgOf(e, 'Your balance could not be loaded. Refresh the page to try again.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async (message) => { setNote(message || ''); await load(true); }, [load]);

  if (loading) return <BalanceSkeleton />;

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="RazeKit balance" />
        <Alert>{loadErr || 'Your balance could not be loaded. Refresh the page to try again.'}</Alert>
        <Button variant="secondary" size="lg" onClick={() => load()}>Try again</Button>
      </div>
    );
  }

  const isClient = data.role === 'client';
  const balance = data.balance || {};
  const currency = balance.currency || 'INR';
  const account = wd?.account || null;
  const openRequest = (wd?.open || [])[0] || null;
  const support = data.support || {};
  const withdrawals = wd?.withdrawals || data.withdrawals || [];

  return (
    <div className="space-y-7">
      <PageHeader
        title={isClient ? 'Contest funding balance' : 'RazeKit balance'}
        description={isClient
          ? 'What RazeKit holds for you, what is committed to your live contests, and every movement behind those figures.'
          : 'What RazeKit owes you, what you can withdraw today, and every movement behind those figures.'}
      />

      <div aria-live="polite" className="empty:hidden">
        {note && (
          <p className="flex items-start gap-2 rounded-md bg-success/8 px-3 py-2 text-sm font-medium text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{note}
          </p>
        )}
      </div>
      {loadErr && <Alert>{loadErr}</Alert>}

      <Overview balance={balance} isClient={isClient} />
      <BetaCallout />

      {!isClient && (
        <Section title="Withdrawals"
          description="Withdrawals are prepared and transferred by a person during the beta, not by an automated system.">
          {openRequest && (
            <OpenRequest request={openRequest} currency={currency}
              onCancelled={() => refresh('Your withdrawal request was cancelled and the amount is available again.')} />
          )}
          {wd?.needs_bank_details
            ? <BankDetailsForm onSaved={() => refresh('Bank details saved. You can request a withdrawal now.')} />
            : <RequestForm balance={balance} account={account} onDone={refresh} disabled={Boolean(openRequest || data.open_withdrawal)} />}
          {withdrawals.length > 0 && (
            <RowList items={withdrawals.map((w) => ({
              key: w.reference, title: `${w.reference} · ${w.bank_account_masked || 'saved account'}`,
              meta: `Requested ${dateShort(w.requested_at)}${w.paid_at ? ` · transferred ${dateShort(w.paid_at)}` : ''}${w.payment_reference ? ` · transfer ref ${w.payment_reference}` : ''}`,
              amount: moneyMinor(w.amount_minor, w.currency || currency),
              badge: w.status_label || w.status, badgeTone: w.status_tone,
            }))} />
          )}
        </Section>
      )}

      {isClient && (
        <Section title="Contest funding"
          description="Funding you have reported for your contests. A reported transfer stays a claim until a RazeKit team member verifies it.">
          {(data.fundings || []).length ? (
            <RowList items={data.fundings.map((f) => ({
              key: f.reference, title: f.reference,
              meta: f.verified_at ? `Verified ${dateShort(f.verified_at)}` : 'Not verified yet',
              amount: moneyMinor(f.total_amount_minor, f.currency || currency),
              badge: f.status_label || f.status, badgeTone: f.status_tone,
            }))} />
          ) : (
            <EmptyState icon={Trophy} title="No contest funding yet"
              description="Funding you report for a contest will be listed here with its verification status." />
          )}
        </Section>
      )}

      {isClient && (
        <Section title="Reserved for contests"
          description="Prize money committed to your live contests. It stays committed until a winner is paid or the contest is cancelled.">
          {(data.reserved_contests || []).length ? (
            <RowList items={data.reserved_contests.map((r) => ({
              key: r.reference, title: r.reference, meta: 'Prize commitment held for a live contest',
              amount: moneyMinor(r.prize_amount_minor, currency),
            }))} />
          ) : (
            <EmptyState icon={Lock} title="Nothing reserved right now"
              description="Once a contest of yours goes live, its prize commitment appears here." />
          )}
        </Section>
      )}

      <Section title="Transaction history" description="Every movement on your balance, newest first, each with its own reference.">
        <Transactions rows={data.transactions} currency={currency} />
      </Section>

      {(support.email || support.phone) && (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" />Questions about a figure on this page?
          </span>
          {support.email && <a href={`mailto:${support.email}`} className="text-sm font-medium text-primary underline underline-offset-2">{support.email}</a>}
          {support.phone && <a href={`tel:${support.phone}`} className="text-sm font-medium text-primary underline underline-offset-2">{support.phone}</a>}
        </Card>
      )}
    </div>
  );
}
