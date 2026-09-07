import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import SettingsSection from '@/components/settings/SettingsSection';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CONSEQUENCES = [
  'Your profile, username and public posts will be removed.',
  'Active contest entries and submissions will be cancelled.',
  'Pending payouts and wallet withdrawals will be processed first where required.',
  'Records required for legal, tax or dispute retention may be kept on file.',
  'This action is permanent and cannot be undone.',
];

export default function DeleteAccount() {
  const { logout } = useAuth();
  const [step, setStep] = useState(0);
  const [user, setUser] = useState(null);
  const [emailConfirm, setEmailConfirm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { base44.auth.me().catch(() => null).then(setUser); }, []);

  const submit = async () => {
    setSubmitting(true);
    try {
      if (user?.id) {
        await base44.entities.SupportTicket.create({
          user_id: user.id,
          user_name: user.full_name,
          user_email: user.email,
          user_role: user.user_role,
          category: 'account_deletion',
          subject: 'Account deletion request',
          description: 'User submitted a permanent account deletion request through the protected flow.',
          status: 'open',
          priority: 'high',
        });
      }
      // Invalidates the server session, clears all client state, syncs other tabs.
      await logout();
    } catch (e) {
      toast({ title: 'Failed to submit', description: e.message, variant: 'destructive' });
      setSubmitting(false);
    }
  };

  return (
    <SettingsSection title="Delete Account">
      {step === 0 && (
        <div className="space-y-4">
          <div className="bg-destructive/5 border border-destructive/30 rounded-2xl p-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-heading font-semibold text-destructive">This is permanent</p>
              <p className="text-sm text-muted-foreground mt-1">Deleting your account cannot be undone. Please review what happens below.</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-heading text-base font-semibold">What happens when you delete</h2>
            <ul className="space-y-2">
              {CONSEQUENCES.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground"><span className="text-destructive">•</span> {c}</li>
              ))}
            </ul>
          </div>
          <Button variant="destructive" className="w-full h-10" onClick={() => setStep(1)}>I understand, continue</Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-heading text-base font-semibold">Confirm your identity</h2>
            <p className="text-sm text-muted-foreground">Type your email <span className="font-medium text-foreground">{user?.email}</span> to continue.</p>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={emailConfirm} onChange={e => setEmailConfirm(e.target.value)} placeholder="Your email" className="h-10" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setStep(0)}>Back</Button>
            <Button variant="destructive" className="flex-1 h-10" disabled={emailConfirm.trim().toLowerCase() !== (user?.email || '').toLowerCase()} onClick={() => setStep(2)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-heading text-base font-semibold">Final confirmation</h2>
            <p className="text-sm text-muted-foreground">Type <span className="font-mono font-medium text-foreground">DELETE</span> to permanently submit your deletion request.</p>
            <div className="space-y-2">
              <Label>Confirmation</Label>
              <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="DELETE" className="h-10" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-10" onClick={() => setStep(1)}>Back</Button>
            <Button variant="destructive" className="flex-1 h-10" disabled={deleteConfirm !== 'DELETE' || submitting} onClick={submit}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : 'Delete my account'}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}