// Help Center (spec 13/14): a 10-page structured guide, a grounded support
// assistant, and the ticket lifecycle.
//
// Guide content describes only what is actually implemented. Nothing here
// documents a planned feature as though it exists.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, MessageSquare, LifeBuoy, ChevronLeft, ChevronRight, Search,
  ShieldCheck, Trophy, Target, Activity, Wallet, Users, Sparkles, Send, Clock,
} from 'lucide-react';
import { fn, contestRules } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader, Card, Button, Input, Label, Segmented, Badge, Spinner, EmptyState } from '@/components/ui';

const STATUS_TONE = {
  open: 'primary', acknowledged: 'primary', in_review: 'warning',
  waiting_for_user: 'warning', waiting_for_internal_team: 'warning',
  resolved: 'success', closed: 'neutral',
};
const pretty = (s) => String(s || '').replace(/_/g, ' ');

// ── 10-page guide ─────────────────────────────────────────────────────────────
const GUIDE = (tiers) => [
  { n: 1, icon: Sparkles, title: 'Welcome to RazeKit',
    body: ['RazeKit is a contest marketplace for creative work. Brands publish prize-funded briefs; creators compete by making the work; the strongest performance wins.',
           'Two journeys run side by side. A brand defines a brief and a prize, then reviews real submissions. A creator finds briefs worth entering, submits work, and builds a measurable track record.'],
    points: ['Brands get real creative work and measurable campaign performance.', 'Creators get paid briefs and a verifiable performance history.'] },
  { n: 2, icon: Users, title: 'Choose your role',
    body: ['You pick your account type when you join, and it shapes the whole product.'],
    points: ['Creator — discover contests, submit work, track scores and wins.',
             'Brand — publish prize-funded contests, review submissions, see campaign performance.',
             'Visitor — browse open contests and finalized winners before joining.',
             'Your account type is set once at sign-up. Changing it later needs RazeKit support.'] },
  { n: 3, icon: Target, title: 'How contests work',
    body: ['Every contest follows the same lifecycle, so both sides know what happens next.'],
    points: ['A brand publishes a brief with a prize and a deadline.',
             'Creators discover it and join.', 'Creators submit their work before the deadline.',
             'Performance is measured from real signals.',
             'The winner is finalized by the scoring engine and the result becomes official.'] },
  { n: 4, icon: Clock, title: 'Prize & fair duration',
    body: ['RazeKit sets the allowed contest duration from the prize value. This keeps timelines fair and predictable for everyone, and it is enforced by the server — not just the form.'],
    points: [...tiers, 'No contest may run longer than 30 days.',
             'A brand cannot choose a duration outside the window for its prize.'] },
  { n: 5, icon: Activity, title: 'How creators participate',
    body: ['The path from discovery to result is deliberately short.'],
    points: ['Discover a brief that matches your work.', 'Read the requirements and join.',
             'Create the work and submit it before the deadline.',
             'Request your tracked campaign link so brand traffic can be measured.',
             'Follow your score in Tracker until the result is final.'] },
  { n: 6, icon: Activity, title: 'How performance is measured',
    body: ['Performance has exactly two dimensions, each normalized to 0–100.'],
    points: ['Video Engagement — the overall performance of your creative work across supported signals: views, likes, comments, shares, saves, watch time and follower growth.',
             'Brand Traffic — verified people who actually reached the brand through your tracked link.',
             'A view is not a visit. The two are measured separately and never conflated.',
             'Activity that cannot be verified may be excluded from performance calculations.'] },
  { n: 7, icon: Trophy, title: 'How winners are determined',
    body: ['Final Score = 50% Video Engagement + 50% Brand Traffic. The highest Final Score wins.'],
    points: ['Creator A — Engagement 95, Traffic 60 → Final 77.5',
             'Creator B — Engagement 75, Traffic 95 → Final 85.0 (winner)',
             'Creator C — Engagement 88, Traffic 70 → Final 79.0',
             'Ties break on Brand Traffic, then Video Engagement, then the earlier submission — never randomly.',
             'Popularity alone cannot win, and a brand cannot override the computed result.'] },
  { n: 8, icon: Activity, title: 'Tracker',
    body: ['Tracker is your performance intelligence view, and it only ever shows your own data.'],
    points: ['Creator Tracker — contests joined, submissions, scores, verified traffic, wins and earnings.',
             'Brand Tracker — campaigns, participating creators, submissions and verified brand traffic.',
             'Scores show their state: provisional while signals are still arriving, final once locked.'] },
  { n: 9, icon: Trophy, title: 'Winners & leaderboard',
    body: ['Winners showcases officially finalized winning work with its brand, contest, prize and result.'],
    points: ['Only finalized contests appear — nothing is published early.',
             'The leaderboard uses the same RazeKit scoring system.',
             'Rankings are never based on follower count or popularity.'] },
  { n: 10, icon: Wallet, title: 'Payments, handover & help',
    body: ['Prize funding and winner payouts are currently arranged off-platform. Your Tracker records the prize value of contests you have won.'],
    points: ['Where a contest requires handover, that step happens after the winner is final.',
             'For anything specific to your own payment, payout or account, raise a ticket.',
             'Billing, payout, account access and security issues always go to a person.'] },
];

function Guide() {
  const [page, setPage] = useState(() => {
    try { return Number(localStorage.getItem('rk_guide_page')) || 1; } catch { return 1; }
  });
  const [q, setQ] = useState('');
  const [tiers, setTiers] = useState(['₹5,000–₹20,000: 1–3 days', '₹20,001–₹50,000: 1–7 days', '₹50,001–₹1,00,000: 7–15 days', 'Above ₹1,00,000: 7–30 days']);

  // Duration tiers come from the server so the guide can never drift from the rule.
  useEffect(() => {
    contestRules().then((r) => {
      if (r?.tiers) setTiers(r.tiers.map((t) => `${t.label}: ${t.minDays}–${t.maxDays} days`));
    }).catch(() => {});
  }, []);

  const pages = useMemo(() => GUIDE(tiers), [tiers]);
  useEffect(() => { try { localStorage.setItem('rk_guide_page', String(page)); } catch {} }, [page]);

  const hits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return pages.filter((p) =>
      `${p.title} ${p.body.join(' ')} ${p.points.join(' ')}`.toLowerCase().includes(term));
  }, [q, pages]);

  const p = pages.find((x) => x.n === page) || pages[0];
  const Icon = p.icon;

  return (
    <div className="space-y-4">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide…" aria-label="Search the guide" />

      {hits ? (
        hits.length === 0
          ? <EmptyState icon={Search} title="No matches" description="Try a different word, or ask support below." />
          : (
            <div className="space-y-2">
              {hits.map((h) => (
                <button key={h.n} onClick={() => { setQ(''); setPage(h.n); }}
                  className="w-full text-left rounded-lg border border-line bg-surface p-3 hover:border-line-strong transition-colors">
                  <p className="text-[11px] uppercase tracking-wider text-muted">Page {h.n}</p>
                  <p className="font-semibold text-ink">{h.title}</p>
                </button>
              ))}
            </div>
          )
      ) : (
        <>
          {/* Progress + jump-to-page */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {pages.map((x) => (
              <button key={x.n} onClick={() => setPage(x.n)} aria-label={`Go to page ${x.n}`} aria-current={x.n === page}
                className={`h-1.5 rounded-full transition-all ${x.n === page ? 'w-7 bg-primary' : 'w-4 bg-line hover:bg-line-strong'}`} />
            ))}
            <span className="ml-auto text-[11px] text-muted nums">Page {page} of {pages.length}</span>
          </div>

          <Card className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
                <Icon className="w-4.5 h-4.5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Step {p.n}</p>
                <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">{p.title}</h2>
              </div>
            </div>
            {p.body.map((b, i) => <p key={i} className="text-sm leading-relaxed text-muted">{b}</p>)}
            <ul className="space-y-2">
              {p.points.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-success mt-0.5" aria-hidden="true" />
                  <span className="leading-snug">{pt}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" disabled={page === 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
            <Button disabled={page === pages.length} onClick={() => setPage((n) => Math.min(pages.length, n + 1))}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Ask Support ───────────────────────────────────────────────────────────────
function AskSupport({ onEscalate }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);

  const ask = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setReply(null);
    try { setReply(await fn('supportAsk', { question: q })); }
    catch { setReply({ answered: false, answer: "I don't have verified information about that yet.", escalate: true }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <form onSubmit={ask} className="flex flex-col sm:flex-row gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about contests, scoring, traffic, Tracker…" aria-label="Ask support" className="flex-1" />
          <Button type="submit" loading={busy}><Send className="w-4 h-4" /> Ask</Button>
        </form>
        <p className="text-[11px] text-muted">
          Answers come only from verified RazeKit knowledge. For anything about your own payment, payout or account, a person will help.
        </p>
      </Card>

      {reply && (
        <Card className="p-5 space-y-3">
          <p className="text-sm leading-relaxed text-ink">{reply.answer}</p>
          {reply.followup && <p className="text-sm text-muted">{reply.followup}</p>}
          {reply.escalate && (
            <Button variant="secondary" onClick={onEscalate}><LifeBuoy className="w-4 h-4" /> Raise a ticket</Button>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Tickets ───────────────────────────────────────────────────────────────────
const CATEGORIES = ['account', 'contest', 'submission', 'payment', 'payout', 'tracker', 'winner', 'technical', 'security', 'other'];

function Tickets() {
  const { user } = useAuth();
  const [form, setForm] = useState({ category: 'contest', subject: '', description: '' });
  const [tickets, setTickets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => fn('supportTicketList').then((d) => setTickets(d.tickets || [])).catch(() => setTickets([]));
  useEffect(() => { if (user) load(); else setTickets([]); }, [user?.id]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      const r = await fn('supportTicketCreate', form);
      if (r?.error) { setErr(r.error.message || r.error); return; }
      setMsg(`Ticket ${r.ticket_id} received. We'll follow up here.`);
      setForm({ category: 'contest', subject: '', description: '' });
      load();
    } catch (e2) {
      setErr(e2?.data?.error?.message || e2?.data?.error || e2.message || 'Could not raise the ticket.');
    } finally { setBusy(false); }
  };

  if (!user) {
    return <EmptyState icon={LifeBuoy} title="Sign in to raise a ticket" description="Tickets are tied to your account so we can look up the right details."
      action={<Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>} />;
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Raise a ticket</h2>
        {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}
        {msg && <div className="rounded-md bg-success/10 text-success text-sm px-3 py-2">{msg}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="cat">Category</Label>
            <select id="cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div><Label htmlFor="sub">Subject</Label>
            <Input id="sub" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Short summary" /></div>
          <div><Label htmlFor="desc">Description</Label>
            <textarea id="desc" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What happened, and what did you expect?"
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
          <Button type="submit" loading={busy}>Submit ticket</Button>
        </form>
      </Card>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">My tickets</h2>
        {tickets === null ? <div className="py-8 grid place-items-center"><Spinner /></div>
          : tickets.length === 0 ? <EmptyState icon={MessageSquare} title="No tickets yet" description="Anything we can't answer automatically becomes a ticket here." />
          : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <Card key={t.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{t.subject}</p>
                      <p className="text-[11px] text-muted">{t.ticket_id} · {pretty(t.category)}</p>
                    </div>
                    <Badge tone={STATUS_TONE[t.status] || 'neutral'}>{pretty(t.status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted leading-snug">{t.description}</p>
                  {t.admin_response && (
                    <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">RazeKit support</p>
                      <p className="mt-1 text-sm text-ink leading-snug">{t.admin_response}</p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export default function Help() {
  const [tab, setTab] = useState('guide');
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader title="Help Center" description="Learn how RazeKit works, ask a question, or reach a person." />
      <Segmented value={tab} onChange={setTab} tabs={[
        { key: 'guide', label: 'Guide' },
        { key: 'ask', label: 'Ask support' },
        { key: 'tickets', label: 'Tickets' },
      ]} />
      {tab === 'guide' && <Guide />}
      {tab === 'ask' && <AskSupport onEscalate={() => setTab('tickets')} />}
      {tab === 'tickets' && <Tickets />}
    </div>
  );
}
