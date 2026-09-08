import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { entities } from '@/lib/api';
import { money } from '@/lib/format';
import { PageHeader, Card, Button, Input, Label } from '@/components/ui';

const CATEGORIES = ['Instagram Reel', 'YouTube Shorts', 'YouTube Video', 'Advertisement', 'Gaming', 'Wedding', 'Documentary', 'Corporate', 'Travel', 'Music Video'];
const MARKETS = {
  IN: { label: 'India (₹ INR)', currency: 'INR', region: 'IN', symbol: '₹' },
  GLOBAL: { label: 'International ($ USD)', currency: 'USD', region: 'GLOBAL', symbol: '$' },
};

export default function CreateContest() {
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', short_description: '', category: CATEGORIES[0], description: '', prize_amount: '', number_of_winners: 1, deadline: '', market: 'IN' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const mkt = MARKETS[f.market] || MARKETS.IN;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.title.trim()) return setErr('Give your contest a title.');
    if (!Number(f.prize_amount)) return setErr('Set a prize amount.');
    if (!f.deadline) return setErr('Pick a deadline.');
    setSaving(true);
    try {
      const c = await entities.Contest.create({
        title: f.title.trim(), short_description: f.short_description.trim(), category: f.category,
        description: f.description.trim(), prize_amount: Number(f.prize_amount), number_of_winners: Number(f.number_of_winners) || 1,
        deadline: new Date(f.deadline).toISOString(), currency: mkt.currency, settlement_region: mkt.region, status: 'open',
      });
      navigate(`/contest/${c.id}`);
    } catch (e2) { setErr(e2.message || 'Could not create the contest.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="w-4 h-4" /> Back</button>
      <PageHeader eyebrow="Brand" title="Launch a contest" description="Brief the work, set the prize, and let creators compete." />
      {err && <div className="rounded-md bg-danger/8 text-danger text-sm px-3 py-2">{err}</div>}
      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Basics</h2>
          <div><Label htmlFor="t">Contest title</Label><Input id="t" value={f.title} onChange={set('title')} placeholder="e.g. 30s launch reel for our new app" /></div>
          <div><Label htmlFor="sd">Short description</Label><Input id="sd" value={f.short_description} onChange={set('short_description')} placeholder="One line creators see first" /></div>
          <div><Label htmlFor="cat">Category</Label>
            <select id="cat" value={f.category} onChange={set('category')} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </Card>
        <Card className="p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Brief</h2>
          <textarea rows={5} value={f.description} onChange={set('description')} placeholder="Describe the deliverable, style, references, do’s and don’ts…"
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </Card>
        <Card className="p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Prize &amp; timeline</h2>
          <div><Label htmlFor="mk">Market &amp; currency</Label>
            <select id="mk" value={f.market} onChange={set('market')} className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              {Object.entries(MARKETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <p className="mt-1 text-[11px] text-muted">Sets the prize currency. Prizes are arranged with winners off-platform.</p></div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><Label htmlFor="p">Prize ({mkt.symbol})</Label><Input id="p" type="number" min="0" value={f.prize_amount} onChange={set('prize_amount')} placeholder={f.market === 'GLOBAL' ? '300' : '25000'} className="nums" /></div>
            <div><Label htmlFor="w">Winners</Label><Input id="w" type="number" min="1" value={f.number_of_winners} onChange={set('number_of_winners')} className="nums" /></div>
            <div><Label htmlFor="d">Deadline</Label><Input id="d" type="datetime-local" value={f.deadline} onChange={set('deadline')} /></div>
          </div>
          {Number(f.prize_amount) > 0 && <p className="text-sm text-muted">Prize pool: <span className="font-semibold text-ink nums">{money(f.prize_amount, mkt.currency)}</span> · a platform fee is shown at funding.</p>}
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={saving}>Publish contest</Button>
        </div>
      </form>
    </div>
  );
}
