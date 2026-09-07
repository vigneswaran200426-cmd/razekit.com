import { IndianRupee, AlertCircle, Scale } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseJSON, computeDistribution, positionsJSON, formatMoney, platformFee } from '@/lib/campaign-brief';

export default function AwardsSection({ data, update }) {
  const positions = parseJSON(data.prize_positions);
  const pool = Number(data.prize_amount) || 0;
  const distSum = positions.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const mismatch = pool > 0 && distSum !== pool;

  const setPool = (val) => {
    const p = parseFloat(val) || 0;
    update({ prize_amount: p, prize_positions: positionsJSON(computeDistribution(p, data.number_of_winners)) });
  };

  const setWinners = (n) => {
    const w = Math.max(1, Math.min(10, parseInt(n) || 1));
    update({ number_of_winners: w, prize_positions: positionsJSON(computeDistribution(pool, w)) });
  };

  const setAmount = (i, val) => {
    const next = positions.map((p, idx) => (idx === i ? { ...p, amount: Math.max(0, parseFloat(val) || 0) } : p));
    update({ prize_positions: JSON.stringify(next) });
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Total Award Pool *</Label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="bg-background pl-10" type="number" min="0" value={pool || ''} onChange={(e) => setPool(e.target.value)} placeholder="2000" />
          </div>
          <div className="flex gap-2">
            {[500, 2000, 10000, 50000].map((amt) => (
              <button key={amt} type="button" onClick={() => setPool(String(amt))} className="px-2.5 py-1 rounded-full text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors">{formatMoney(amt)}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Number of Winners *</Label>
          <Input className="bg-background" type="number" min="1" max="10" value={data.number_of_winners || 1} onChange={(e) => setWinners(e.target.value)} />
          <div className="flex gap-2">
            {[1, 2, 3, 5].map((n) => (
              <button key={n} type="button" onClick={() => setWinners(String(n))} className="px-2.5 py-1 rounded-full text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors">{n} winner{n > 1 ? 's' : ''}</button>
            ))}
          </div>
        </div>
      </div>

      {pool > 0 && (
        <div className="border border-border rounded-xl p-4 space-y-3 bg-background">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider">Per-Position Distribution</Label>
            <button type="button" onClick={() => update({ prize_positions: positionsJSON(computeDistribution(pool, data.number_of_winners)) })}
              className="text-xs text-accent hover:underline inline-flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> Distribute evenly</button>
          </div>
          <div className="space-y-2">
            {positions.map((p, i) => (
              <div key={p.position} className="flex items-center gap-3">
                <span className="w-20 text-sm text-muted-foreground shrink-0">{p.position === 1 ? 'Winner' : `Runner-up ${p.position - 1}`}</span>
                <div className="relative flex-1 max-w-40">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="bg-background pl-10 h-9" type="number" min="0" value={p.amount} onChange={(e) => setAmount(i, e.target.value)} />
                </div>
                <span className="text-xs text-muted-foreground">{pool > 0 ? Math.round(((p.amount || 0) / pool) * 100) : 0}%</span>
              </div>
            ))}
          </div>
          <div className={`flex items-center gap-2 text-sm ${mismatch ? 'text-destructive' : 'text-success'}`}>
            {mismatch ? <AlertCircle className="w-4 h-4" /> : null}
            <span>Distributed: <strong>{formatMoney(distSum)}</strong> of {formatMoney(pool)} — {mismatch ? 'must equal the funded award amount' : 'matches the award pool'}</span>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">A {Math.round(100 * 0.1)}% platform fee ({formatMoney(platformFee(pool))}) is added at launch — shown in the funding panel.</p>
    </div>
  );
}