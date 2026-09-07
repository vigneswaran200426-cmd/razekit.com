import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SettingsSection from '@/components/settings/SettingsSection';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';

const CATEGORIES = [
  { key: 'notif_contests', label: 'Contest updates', desc: 'Deadlines, status changes & contest activity' },
  { key: 'notif_submissions', label: 'New submissions', desc: 'When editors submit entries to your contests' },
  { key: 'notif_winners', label: 'Winner & results', desc: 'Winner announcements and final delivery updates' },
  { key: 'notif_payments', label: 'Payments', desc: 'Deposits, charges & refunds' },
  { key: 'notif_payouts', label: 'Payouts', desc: 'Withdrawals & prize payouts' },
  { key: 'notif_messages', label: 'Messages', desc: 'Direct messages and mentions' },
  { key: 'notif_support', label: 'Support & system', desc: 'Account, security & platform announcements' },
];

export default function NotificationSettings() {
  const [pref, setPref] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        const existing = await base44.entities.UserPreference.filter({ user_id: me.id }, '-created_date', 1).catch(() => []);
        let p = existing[0];
        if (!p) p = await base44.entities.UserPreference.create({ user_id: me.id });
        setPref(p);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const toggle = async (key, value) => {
    if (!pref) return;
    setSavingKey(key);
    const prev = pref;
    setPref({ ...pref, [key]: value });
    try {
      const updated = await base44.entities.UserPreference.update(pref.id, { [key]: value });
      setPref(updated);
    } catch (e) {
      setPref(prev);
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally { setSavingKey(null); }
  };

  return (
    <SettingsSection title="Notifications">
      <p className="text-sm text-muted-foreground">Choose which notifications you receive. System-critical notices may still be sent for account security.</p>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {CATEGORIES.map(c => (
            <div key={c.key} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </div>
              <Switch checked={!!pref?.[c.key]} disabled={savingKey === c.key} onCheckedChange={(v) => toggle(c.key, v)} />
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}