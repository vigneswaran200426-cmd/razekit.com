import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { IndianRupee, AlertCircle, Plus } from 'lucide-react';
import PillSelect from './PillSelect';
import CountdownTimer from '../CountdownTimer';
import AddFundsDialog from '../AddFundsDialog';

const DEADLINE_OPTIONS = ["6 Hours", "12 Hours", "24 Hours", "2 Days", "3 Days", "5 Days", "7 Days"];

function calculateDeadline(option) {
  const now = new Date();
  const map = { "6 Hours": 6e6, "12 Hours": 12e6, "24 Hours": 24e6, "2 Days": 2 * 864e5, "3 Days": 3 * 864e5, "5 Days": 5 * 864e5, "7 Days": 7 * 864e5 };
  return new Date(now.getTime() + (map[option] || 0));
}

function toDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function Step3PrizeDeadline({ formData, updateFormData, availableFunds, onFundsUpdated }) {
  const [showAddFunds, setShowAddFunds] = useState(false);

  const prizeAmount = formData.prize_amount || 0;
  const platformFee = Math.round(prizeAmount * 0.1);
  const totalCost = prizeAmount + platformFee;
  const remainingBalance = availableFunds - totalCost;
  const insufficientFunds = remainingBalance < 0;

  const handlePrizeChange = (val) => {
    const prize = parseFloat(val) || 0;
    updateFormData({ prize_amount: prize, platform_fee: Math.round(prize * 0.1) });
  };

  const handleDeadlineSelect = (option) => {
    if (option === 'Custom') {
      updateFormData({ deadline_option: 'Custom' });
    } else {
      updateFormData({ deadline_option: option, deadline: calculateDeadline(option).toISOString() });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="font-heading text-xl font-bold mb-1">Prize & Deadline</h2>
        <p className="text-sm text-muted-foreground">Set the contest value and timeline.</p>
      </div>

      <div className="space-y-2">
        <Label>Prize Amount *</Label>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input type="number" value={formData.prize_amount || ''} onChange={(e) => handlePrizeChange(e.target.value)}
            placeholder="2000" className="pl-10 bg-input" />
        </div>
        <div className="flex gap-2">
          {[500, 2000, 10000, 50000].map(amt => (
            <button key={amt} type="button" onClick={() => handlePrizeChange(String(amt))}
              className="px-3 py-1 rounded-full text-xs bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              ₹{amt.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Contest Deadline *</Label>
        <PillSelect options={DEADLINE_OPTIONS} value={formData.deadline_option}
          onChange={handleDeadlineSelect}
          allowCustom
          customInputType="datetime-local"
          customValue={toDatetimeLocalValue(formData.deadline)}
          onCustomChange={(v) => updateFormData({ deadline_option: 'Custom', deadline: new Date(v).toISOString() })} />
        {formData.deadline && (
          <p className="text-sm text-muted-foreground">
            Time remaining: <CountdownTimer deadline={formData.deadline} className="text-primary font-medium" />
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">Payment Summary</h3>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Prize Amount</span><span className="font-medium">₹{prizeAmount.toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Platform Fee (10%)</span><span className="font-medium">₹{platformFee.toLocaleString('en-IN')}</span></div>
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Cost</span><span className="font-bold text-primary">₹{totalCost.toLocaleString('en-IN')}</span></div>
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Available Balance</span><span className={insufficientFunds ? 'text-destructive font-medium' : 'text-success font-medium'}>₹{availableFunds.toLocaleString('en-IN')}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Remaining After Publishing</span><span className={insufficientFunds ? 'text-destructive font-medium' : 'text-success font-medium'}>₹{remainingBalance.toLocaleString('en-IN')}</span></div>
        </div>
      </div>

      {insufficientFunds && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Insufficient wallet balance to publish</span>
          </div>
          <Button size="sm" onClick={() => setShowAddFunds(true)}><Plus className="w-4 h-4 mr-1" /> Add to Wallet</Button>
        </div>
      )}

      <AddFundsDialog open={showAddFunds} onOpenChange={setShowAddFunds} onSuccess={onFundsUpdated} />
    </div>
  );
}