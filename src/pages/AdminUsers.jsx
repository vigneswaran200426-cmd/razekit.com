import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Search, Loader2, Users } from 'lucide-react';
import RoleBadge from '@/components/RoleBadge';
import AdminUserModal from '@/components/admin/AdminUserModal';
import { isAppAdmin } from '@/lib/role-utils';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'client', label: 'Clients' },
  { key: 'editor', label: 'Creators' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'recent', label: 'Recently Registered' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

const STATUS_STYLE = {
  active: 'bg-success/10 text-success',
  pending: 'bg-amber-500/10 text-amber-600',
  suspended: 'bg-destructive/10 text-destructive',
  rejected: 'bg-destructive/10 text-destructive',
  disabled: 'bg-secondary text-muted-foreground',
};

export default function AdminUsers() {
  const { user, isLoadingAuth } = useAuth();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, p, c] = await Promise.all([
        base44.entities.User.list('-created_date', 200).catch(() => []),
        base44.entities.UserProfile.list('-created_date', 200).catch(() => []),
        base44.entities.UserContact.list('-created_date', 200).catch(() => []),
      ]);
      setUsers(u);
      setProfiles(p);
      setContacts(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAppAdmin(user)) load();
    else if (!isLoadingAuth) setLoading(false);
  }, [user, isLoadingAuth]);

  if (isLoadingAuth) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!isAppAdmin(user)) return <Navigate to="/" replace />;

  const profileByUid = new Map(profiles.map((p) => [p.user_id, p]));
  const contactByUid = new Map(contacts.map((c) => [c.user_id, c]));
  const rows = users.map((u) => ({ ...u, profile: profileByUid.get(u.id), contact: contactByUid.get(u.id) }));

  const filtered = rows.filter((r) => {
    const c = r.contact || {};
    const status = c.account_status || 'active';
    const verify = c.verification_status || 'unverified';
    if (filter === 'client' && r.user_role !== 'client') return false;
    if (filter === 'editor' && r.user_role !== 'editor') return false;
    if (filter === 'pending' && status !== 'pending') return false;
    if (filter === 'active' && status !== 'active') return false;
    if (filter === 'suspended' && status !== 'suspended') return false;
    if (filter === 'verified' && verify !== 'verified') return false;
    if (filter === 'unverified' && verify === 'verified') return false;
    if (filter === 'recent') {
      const days = (Date.now() - new Date(r.created_date).getTime()) / 86400000;
      if (days > 30) return false;
    }
    if (query) {
      const q = query.toLowerCase();
      const hay = `${r.full_name || ''} ${r.email || ''} ${r.id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-8">
      <div className="flex items-center gap-2 mb-5">
        <Users className="w-5 h-5 text-primary" />
        <h1 className="font-heading text-xl font-bold">Users — New Registrations</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, user id"
          className="w-full h-10 rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No users found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const p = r.profile || {};
            const c = r.contact || {};
            const status = c.account_status || 'active';
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="w-full flex items-center gap-3 bg-card border border-border rounded-2xl p-3.5 hover:border-primary/40 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-heading text-sm font-bold text-primary">{(r.full_name || r.email || '?')[0]}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{r.full_name || r.email}</p>
                    <RoleBadge role={r.user_role} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.email} · {p.country || '—'} · {new Date(r.created_date).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium shrink-0 ${STATUS_STYLE[status] || 'bg-secondary text-muted-foreground'}`}>
                  {status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && <AdminUserModal user={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}