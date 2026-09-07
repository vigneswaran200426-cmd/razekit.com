import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, ArrowLeft, Gavel, Check, Shield } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { appealWarning } from '@/lib/enforcement-utils';
import PageHeader from '@/components/ui/PageHeader';
import AlertState from '@/components/alerts/AlertState';
import { Button } from '@/components/ui/button';

const ACTION_LABELS = {
  create_context: 'creating new contexts', fund_context: 'funding contexts', manage_context: 'managing contexts',
  invite_creator: 'inviting creators', join_context: 'joining contexts', submit_work: 'submitting work',
  request_footage: 'requesting footage', new_withdrawal: 'new withdrawals',
};

export default function AccountStanding() {
  const [user, setUser] = useState(null);
  const [standing, setStanding] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appealFor, setAppealFor] = useState(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealFile, setAppealFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const detailsRef = useRef(null);

  const load = async () => {
    const me = await base44.auth.me().catch(() => null);
    setUser(me);
    if (me?.id) {
      const [s, w] = await Promise.all([
        base44.entities.AccountStanding.filter({ user_id: me.id }, '-created_date', 1).catch(() => []),
        base44.entities.Warning.filter({ user_id: me.id }, '-created_date', 50).catch(() => []),
      ]);
      setStanding(s[0] || null);
      setWarnings(w);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submitAppeal = async () => {
    if (!appealReason.trim() || !appealFor) return;
    setSubmitting(true);
    try {
      let evidenceUrl = '';
      if (appealFile) { const up = await base44.integrations.Core.UploadFile({ file: appealFile }); evidenceUrl = up?.file_url || ''; }
      await appealWarning({ user, warning: appealFor, reason: appealReason, evidenceUrl });
      setDone(true);
      setTimeout(() => { setAppealFor(null); setDone(false); setAppealReason(''); setAppealFile(null); load(); }, 1000);
    } catch (e) { /* ignore */ } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const activeWarnings = warnings.filter((w) => w.status === 'active');
  const status = standing?.status || 'active';
  const hasIssue = status !== 'active' || activeWarnings.length > 0;

  // Clean account — nothing moderation-related is shown.
  if (!hasIssue) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto min-h-[60vh] flex items-center justify-center">
        <AlertState
          type="success"
          shape="ring"
          title="Your account is in good standing"
          description="No warnings, restrictions, or open issues on your account."
          action={{ label: 'Back to Home', to: '/' }}
        />
      </div>
    );
  }

  const restrictedActions = (() => { try { return JSON.parse(standing?.restricted_actions || '[]'); } catch { return []; } })();
  const restrictedLabels = restrictedActions.map((a) => ACTION_LABELS[a]).filter(Boolean);

  let noticeTitle, noticeDesc;
  if (status === 'suspended') {
    noticeTitle = 'Your account has been suspended';
    noticeDesc = 'Most account actions are unavailable while your account is suspended. This remains in effect until reviewed by Trust & Safety.';
  } else if (status === 'terminated') {
    noticeTitle = 'Your account has been terminated';
    noticeDesc = 'Your account is no longer active. Contact Trust & Safety for more information.';
  } else if (status === 'restricted') {
    noticeTitle = 'Your account has been restricted';
    noticeDesc = restrictedLabels.length
      ? `The following are currently unavailable: ${restrictedLabels.join(', ')}.`
      : 'Some features are currently unavailable.';
  } else {
    noticeTitle = 'Your account received a policy warning';
    noticeDesc = 'A verified policy violation was found against your account. Review the details below.';
  }
  const latest = activeWarnings[0];
  const scrollToDetails = () => detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const accent = status === 'suspended' || status === 'terminated' ? 'border-destructive/30 bg-destructive/5'
    : status === 'restricted' ? 'border-orange-500/30 bg-orange-500/5' : 'border-amber-500/30 bg-amber-500/5';
  const accentIcon = status === 'suspended' || status === 'terminated' ? 'text-destructive'
    : status === 'restricted' ? 'text-orange-600' : 'text-amber-600';

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-8 space-y-5">
      <PageHeader
        title="Account standing"
        subtitle="Your status and any active restrictions."
        backTo="/"
        backLabel="Home"
        icon={Shield}
      />

      <div className={`rounded-2xl p-5 border elev-1 ${accent}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${accentIcon}`} />
          <div className="min-w-0 flex-1">
            <p className="font-heading font-semibold">{noticeTitle}</p>
            <p className="text-sm text-muted-foreground mt-1">{noticeDesc}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={scrollToDetails} size="sm">
                <Shield className="w-4 h-4" /> Review
              </Button>
              {latest && status !== 'terminated' && (
                <Button onClick={() => setAppealFor(latest)} variant="outline" size="sm">
                  <Gavel className="w-4 h-4" /> Appeal
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div ref={detailsRef} className="space-y-2 scroll-mt-4">
        {activeWarnings.map((w) => (
          <div key={w.id} className="surface rounded-2xl p-4 elev-1">
            <p className="text-sm font-medium">{w.violation_type}</p>
            {w.reason && <p className="text-xs text-muted-foreground mt-1">{w.reason}</p>}
            <p className="text-[11px] text-muted-foreground mt-2 nums">{new Date(w.created_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            {status !== 'active' && (
              <p className="text-[11px] text-muted-foreground mt-1">Current restriction: <span className="capitalize">{status}</span></p>
            )}
            {status !== 'terminated' && (
              <button onClick={() => setAppealFor(w)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Gavel className="w-3.5 h-3.5" /> Appeal this decision
              </button>
            )}
          </div>
        ))}
      </div>

      {appealFor && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-sm animate-fade-in" onClick={() => setAppealFor(null)}>
          <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-border elev-3 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold">Appeal decision</h3>
              <button onClick={() => setAppealFor(null)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center">✕</button>
            </div>
            {done ? (
              <p className="text-center py-6"><Check className="w-8 h-8 text-success mx-auto mb-2" />Appeal submitted. We'll update you via notifications.</p>
            ) : (
              <>
                <textarea value={appealReason} onChange={(e) => setAppealReason(e.target.value)} rows={3} placeholder="Why should this decision be reviewed?" className="w-full rounded-lg border border-input bg-transparent p-3 text-sm" />
                <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-input cursor-pointer text-sm text-muted-foreground">
                  📎 {appealFile ? appealFile.name : 'Attach evidence (optional)'}
                  <input type="file" className="hidden" onChange={(e) => setAppealFile(e.target.files?.[0] || null)} />
                </label>
                <Button onClick={submitAppeal} disabled={submitting || !appealReason.trim()} size="lg" className="w-full">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />} Submit Appeal
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}