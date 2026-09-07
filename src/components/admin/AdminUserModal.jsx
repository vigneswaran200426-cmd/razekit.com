import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, ShieldCheck, Ban, RotateCcw, Flag, Loader2 } from 'lucide-react';
import RoleBadge from '@/components/RoleBadge';

export default function AdminUserModal({ user, onClose, onChanged }) {
  const [profile, setProfile] = useState(user.profile || null);
  const [contact, setContact] = useState(user.contact || null);
  const [audits, setAudits] = useState([]);
  const [contestCount, setContestCount] = useState(0);
  const [subCount, setSubCount] = useState(0);
  const [acting, setActing] = useState(false);

  const loadExtra = async () => {
    const [a, c, s] = await Promise.all([
      base44.entities.AuditLog.filter({ user_id: user.id }, '-created_date', 20).catch(() => []),
      base44.entities.Contest.filter({ created_by_id: user.id }, '-created_date', 1).catch(() => []),
      base44.entities.Submission.filter({ created_by_id: user.id }, '-created_date', 1).catch(() => []),
    ]);
    setAudits(a);
    setContestCount(c.length);
    setSubCount(s.length);
  };

  useEffect(() => {
    loadExtra();
  }, [user.id]);

  const act = async (action, patch, reason) => {
    setActing(true);
    try {
      // account_status / verification_status now live on the owner/admin-only
      // UserContact entity (admin actions only ever touch those two fields).
      if (patch && contact?.id) {
        const updated = await base44.entities.UserContact.update(contact.id, patch);
        setContact(updated);
      }
      await base44.entities.AuditLog.create({
        user_id: user.id,
        action,
        actor: 'admin',
        status: patch?.account_status || patch?.verification_status || 'ok',
        reason: reason || '',
      }).catch(() => {});
      await loadExtra();
      onChanged?.();
    } finally {
      setActing(false);
    }
  };

  const confirmAct = (action, patch) => {
    const reason = window.prompt(`Reason for ${action.replace(/_/g, ' ')} (optional)`) || '';
    act(action, patch, reason);
  };

  const p = profile || {};
  const c = contact || {};
  const isClient = user.user_role === 'client';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2 min-w-0">
            <RoleBadge role={user.user_role} />
            <p className="font-medium truncate">{user.full_name || user.email}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="p-4 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Email" value={user.email} />
            <Info label="User ID" value={user.id} />
            <Info label="Phone" value={c.phone || '—'} />
            <Info label="Country" value={p.country || '—'} />
            <Info label="Registered" value={new Date(user.created_date).toLocaleString()} />
            <Info label="Account status" value={c.account_status || 'active'} />
            <Info label="Verification" value={c.verification_status || 'unverified'} />
            <Info label="Source" value={c.registration_source || '—'} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {isClient ? 'Business details' : 'Professional details'}
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {isClient ? (
                <>
                  <Info label="Company" value={p.company_name || '—'} />
                  <Info label="Industry" value={p.industry || '—'} />
                  <Info label="Website" value={p.website || '—'} />
                  <Info label="Company size" value={p.company_size || '—'} />
                  <Info label="Categories" value={p.categories || '—'} full />
                  <Info label="Description" value={p.business_description || '—'} full />
                </>
              ) : (
                <>
                  <Info label="Display name" value={p.display_name || '—'} />
                  <Info label="Title" value={p.professional_title || '—'} />
                  <Info label="Experience" value={p.years_experience || '—'} />
                  <Info label="Portfolio" value={p.portfolio_url || '—'} />
                  <Info label="Skills" value={p.skills || '—'} full />
                  <Info label="Tools" value={p.tools || '—'} full />
                  <Info label="Bio" value={p.bio || '—'} full />
                </>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Admin actions</p>
            <div className="flex flex-wrap gap-2">
              <ActionBtn icon={ShieldCheck} color="text-success" label="Verify" disabled={acting}
                onClick={() => confirmAct('verification_changed', { verification_status: 'verified' })} />
              <ActionBtn icon={Ban} color="text-destructive" label="Suspend" disabled={acting}
                onClick={() => confirmAct('account_suspended', { account_status: 'suspended' })} />
              <ActionBtn icon={RotateCcw} color="text-primary" label="Reactivate" disabled={acting}
                onClick={() => confirmAct('account_reactivated', { account_status: 'active' })} />
              <ActionBtn icon={Flag} color="text-amber-500" label="Flag" disabled={acting}
                onClick={() => confirmAct('verification_changed', { verification_status: 'pending_review' })} />
            </div>
            {acting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mt-2" />}
          </div>

          <div className="text-sm text-muted-foreground">
            Associated work: <span className="font-medium text-foreground">{contestCount}</span> contests ·{' '}
            <span className="font-medium text-foreground">{subCount}</span> submissions
            <p className="text-xs mt-0.5">Financial info is viewable only through the existing Admin Payments view.</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Audit history</p>
            {audits.length === 0 ? (
              <p className="text-xs text-muted-foreground">No events.</p>
            ) : (
              <div className="space-y-1">
                {audits.map((a) => (
                  <div key={a.id} className="text-xs flex justify-between gap-3 border-b border-border py-1">
                    <span className="font-medium">{a.action.replace(/_/g, ' ')}{a.reason ? ` · ${a.reason}` : ''}</span>
                    <span className="text-muted-foreground shrink-0">{new Date(a.created_date).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm break-words">{value}</p>
    </div>
  );
}

function ActionBtn({ icon: Icon, color, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 flex items-center gap-1 disabled:opacity-50"
    >
      <Icon className={`w-3.5 h-3.5 ${color}`} /> {label}
    </button>
  );
}