import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, BadgeCheck, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import SettingsSection from '@/components/settings/SettingsSection';
import { getUserProfile } from '@/lib/username-utils';
import RoleBadge from '@/components/RoleBadge';

export default function AccountSettings() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    base44.auth.me().catch(() => null).then(async (u) => {
      setUser(u);
      if (u?.id) {
        const p = await getUserProfile(u.id);
        setProfile(p);
      }
    });
  }, []);

  return (
    <SettingsSection title="Account Details">
      <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary flex items-center justify-center shrink-0">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold truncate">{user?.full_name || '—'}</p>
          <p className="text-xs text-muted-foreground">{profile?.username ? `@${profile.username}` : 'No username set'}</p>
        </div>
        <RoleBadge role={user?.user_role || 'editor'} />
      </div>

      <div className="bg-card border border-border rounded-2xl divide-y divide-border">
        <InfoRow icon={Mail} label="Email" value={user?.email || '—'} />
        <div className="flex items-center justify-between p-4 gap-3">
          <span className="text-sm font-medium flex items-center gap-3 min-w-0"><User className="w-4 h-4 text-muted-foreground shrink-0" /> Username</span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted-foreground">{profile?.username ? `@${profile.username}` : 'Not set'}</span>
            <Link to="/edit-profile" className="text-sm text-primary">Manage</Link>
          </div>
        </div>
        <InfoRow icon={BadgeCheck} label="Role" value={(user?.user_role || 'editor').toUpperCase()} />
        <InfoRow icon={ShieldCheck} label="Account status" value="Active" />
        <InfoRow icon={BadgeCheck} label="Verification" value="Email verified" />
      </div>

      <Link to="/edit-profile" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold hover:bg-primary/90 transition-colors">
        <User className="w-4 h-4" /> Edit profile
      </Link>
    </SettingsSection>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between p-4">
      <span className="text-sm font-medium flex items-center gap-3"><Icon className="w-4 h-4 text-muted-foreground" /> {label}</span>
      <span className="text-sm text-muted-foreground truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}