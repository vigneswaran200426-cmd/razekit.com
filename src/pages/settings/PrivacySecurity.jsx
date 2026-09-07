import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck, KeyRound, MonitorSmartphone, BadgeCheck, Eye, MapPin, Globe, Link2, Trophy, Star, Award } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SettingsSection from '@/components/settings/SettingsSection';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { getUserProfile } from '@/lib/username-utils';

export default function PrivacySecurity() {
  const [pref, setPref] = useState(null);
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        const [existing, p] = await Promise.all([
          base44.entities.UserPreference.filter({ user_id: me.id }, '-created_date', 1).catch(() => []),
          getUserProfile(me.id),
        ]);
        let pr = existing[0];
        if (!pr) pr = await base44.entities.UserPreference.create({ user_id: me.id });
        setPref(pr);
        setProfile(p);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const isClient = user?.user_role === 'client';

  const updatePref = async (key, value) => {
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

  // Visibility flags live on the public-readable UserProfile so visitors can filter.
  const updateProfileFlag = async (key, value) => {
    if (!profile?.id) return;
    setSavingKey(key);
    const prev = profile;
    setProfile({ ...profile, [key]: value });
    try {
      const updated = await base44.entities.UserProfile.update(profile.id, { [key]: value });
      setProfile(updated);
    } catch (e) {
      setProfile(prev);
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally { setSavingKey(null); }
  };

  const isPublic = (profile?.profile_visibility || 'public') !== 'private';

  const visibilityRows = isClient
    ? [
        { key: 'show_location', label: 'Show location', desc: 'Country / region on your business page', icon: MapPin },
        { key: 'show_website', label: 'Show website', desc: 'Link to your business website', icon: Globe },
        { key: 'show_completed_work', label: 'Show completed Contexts', desc: 'Display your finished projects', icon: Trophy },
      ]
    : [
        { key: 'show_location', label: 'Show location', desc: 'Country / region on your profile', icon: MapPin },
        { key: 'show_portfolio', label: 'Show portfolio', desc: 'Link to your portfolio', icon: Link2 },
        { key: 'show_achievements', label: 'Show achievements', desc: 'Level, reputation & wins', icon: Award },
        { key: 'show_ratings', label: 'Show ratings', desc: 'Your public rating', icon: Star },
        { key: 'show_completed_work', label: 'Show completed work', desc: 'Won Contexts & showcase', icon: Trophy },
      ];

  return (
    <SettingsSection title="Privacy & Security">
      <h2 className="font-heading text-base font-semibold">Privacy</h2>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Public profile</p>
              <p className="text-xs text-muted-foreground">{isClient ? 'Allow others to view your business page' : 'Allow others to view your profile'}</p>
            </div>
            <Switch checked={isPublic} disabled={savingKey === 'profile_visibility'} onCheckedChange={(v) => updateProfileFlag('profile_visibility', v ? 'public' : 'private')} />
          </div>
          {visibilityRows.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.desc}</p>
                  </div>
                </div>
                <Switch checked={!!(profile?.[r.key] ?? true)} disabled={savingKey === r.key} onCheckedChange={(v) => updateProfileFlag(r.key, v)} />
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Allow direct messages</p>
              <p className="text-xs text-muted-foreground">Let other users message you</p>
            </div>
            <Switch checked={!!pref?.allow_messages} disabled={savingKey === 'allow_messages'} onCheckedChange={(v) => updatePref('allow_messages', v)} />
          </div>
        </div>
      )}

      <h2 className="font-heading text-base font-semibold pt-2">Security</h2>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-3 min-w-0">
            <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
            <span><span className="text-sm font-medium block">Login method</span><span className="text-xs text-muted-foreground block">Email & password · Google sign-in available</span></span>
          </span>
          <span className="text-sm text-muted-foreground shrink-0">{user?.email ? 'Active' : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-3 min-w-0">
            <BadgeCheck className="w-4 h-4 text-muted-foreground shrink-0" />
            <span><span className="text-sm font-medium block">Account status</span><span className="text-xs text-muted-foreground block">Verification & role managed in Account</span></span>
          </span>
          <Link to="/settings/account" className="text-sm text-primary shrink-0">Manage</Link>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-3 min-w-0">
            <MonitorSmartphone className="w-4 h-4 text-muted-foreground shrink-0" />
            <span><span className="text-sm font-medium block">Active sessions</span><span className="text-xs text-muted-foreground block">Session security is platform-managed</span></span>
          </span>
          <ShieldCheck className="w-4 h-4 text-success shrink-0" />
        </div>
      </div>
    </SettingsSection>
  );
}