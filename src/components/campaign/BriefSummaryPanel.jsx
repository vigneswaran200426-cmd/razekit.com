import { IndianRupee, CheckCircle2, Circle, AlertTriangle, Rocket, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SECTIONS, parseJSON, platformFee, formatMoney, toLocalInputValue, computeDistribution, positionsJSON } from '@/lib/campaign-brief';
import SettlementRegionPicker from '@/components/campaign/SettlementRegionPicker';
import FeeBreakdownCard from '@/components/campaign/FeeBreakdownCard';

const inputCls = 'bg-background h-9';

const Card = ({ title, children }) => (
  <div className="bg-card border border-border rounded-2xl shadow-sm p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</p>
    {children}
  </div>
);

export default function BriefSummaryPanel({ data, update, warnings, sectionDone, funds, onSaveDraft, onLaunch, onOpenAddFunds }) {
  const pool = Number(data.prize_amount) || 0;
  const fee = platformFee(pool);
  const total = pool + fee;
  const insufficient = funds < total;
  const participation = data.private_contest ? 'Invite-only' : data.verified_creators_only ? 'Verified creators only' : 'Open to all';
  const deliverableCount = parseJSON(data.deliverables).length;
  const resourceCount = parseJSON(data.resources).length;

  return (
    <div className="space-y-4 lg:sticky lg:top-6">
      <Card title="Contest Settings">
        <div className="space-y-3">
          <SettlementRegionPicker data={data} update={update} />
          <div className="space-y-1">
            <Label className="text-xs">Award Pool</Label>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input className={`${inputCls} pl-8`} type="number" min="0" value={pool || ''}
                onChange={(e) => { const p = parseFloat(e.target.value) || 0; update({ prize_amount: p, prize_positions: positionsJSON(computeDistribution(p, data.number_of_winners)) }); }} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Submission Deadline</Label>
            <Input className={inputCls} type="datetime-local" value={toLocalInputValue(data.deadline)}
              onChange={(e) => update({ deadline: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Participants</Label>
              <select className="h-9 w-full rounded-md border border-input px-2 text-sm bg-background" value={participation}
                onChange={(e) => update(e.target.value === 'Invite-only' ? { private_contest: true, verified_creators_only: false } : e.target.value === 'Verified creators only' ? { verified_creators_only: true, private_contest: false } : { private_contest: false, verified_creators_only: false })}>
                <option>Open to all</option><option>Verified creators only</option><option>Invite-only</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Winners</Label>
              <Input className={inputCls} type="number" min="1" max="10" value={data.number_of_winners || 1}
                onChange={(e) => { const w = Math.max(1, Math.min(10, parseInt(e.target.value) || 1)); update({ number_of_winners: w, prize_positions: positionsJSON(computeDistribution(pool, w)) }); }} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs">Handover required</Label>
            <Switch checked={!!data.handover_required} onCheckedChange={(v) => update({ handover_required: v })} />
          </div>
        </div>
      </Card>

      <Card title="Creation Progress">
        <div className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/5 text-left">
              {sectionDone[s.number] ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
              <span className={`text-xs ${sectionDone[s.number] ? 'text-foreground' : 'text-muted-foreground'}`}>{s.number}. {s.title}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Validation Warnings">
        {warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-success font-medium"><CheckCircle2 className="w-4 h-4" /> All checks passed — ready to launch.</p>
        ) : (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 text-xs text-amber-600"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" /> {w.message}</p>
            ))}
          </div>
        )}
      </Card>

      <Card title="Funding Status">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground text-xs">Award Pool</span><span className="text-xs font-medium">{formatMoney(pool)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground text-xs">Platform Fee (10%)</span><span className="text-xs font-medium">{formatMoney(fee)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground text-xs">Total to Reserve</span><span className={`text-xs font-bold ${insufficient ? 'text-destructive' : 'text-accent'}`}>{formatMoney(total)}</span></div>
          <div className="flex justify-between border-t border-border pt-1.5"><span className="text-muted-foreground text-xs">Available Balance</span><span className={`text-xs font-medium ${insufficient ? 'text-destructive' : 'text-success'}`}>{formatMoney(funds)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground text-xs">After Launch</span><span className={`text-xs font-medium ${insufficient ? 'text-destructive' : 'text-success'}`}>{formatMoney(funds - total)}</span></div>
          {insufficient && (
            <Button size="sm" className="w-full mt-2 bg-accent hover:bg-accent/90" onClick={onOpenAddFunds}>Add to Wallet</Button>
          )}
        </div>
      </Card>

      <FeeBreakdownCard data={data} />

      <div className="space-y-2">
        <Button className="w-full bg-accent hover:bg-accent/90" onClick={onLaunch}><Rocket className="w-4 h-4" /> Review & Launch Contest</Button>
        <Button variant="outline" className="w-full" onClick={onSaveDraft}><Save className="w-4 h-4" /> Save Draft</Button>
      </div>
    </div>
  );
}