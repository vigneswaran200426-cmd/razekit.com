import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';

export default function AddFundsDialog({ open, onOpenChange, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await base44.entities.FundsTransaction.create({
        type: 'add',
        amount: value,
        description: 'Wallet top-up',
      });
      setAmount('');
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to top up wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Amount (₹)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="1000" className="bg-input" />
          <div className="flex gap-2">
            {[500, 1000, 5000, 10000].map(amt => (
              <Button key={amt} variant="outline" size="sm" onClick={() => setAmount(String(amt))}>₹{amt.toLocaleString('en-IN')}</Button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={loading || !amount}>{loading ? 'Adding...' : 'Add to Wallet'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}