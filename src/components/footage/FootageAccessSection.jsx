import { useState, useEffect } from 'react';
import { Shield, Lock, Check, ExternalLink, AlertTriangle, Eye, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/Mobile|Android|iPhone/i.test(ua)) return 'Mobile';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  return 'Desktop';
};

export default function FootageAccessSection({ contest, user, isOwner }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [accessing, setAccessing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [accessCount, setAccessCount] = useState(0);
  const [hasJoined, setHasJoined] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const checkStatus = async () => {
      if (!user?.id) return;
      const [acceptance, logs, submissions] = await Promise.all([
        base44.entities.TermsAcceptance.filter({ user_id: user.id, contest_id: contest.id }).catch(() => []),
        base44.entities.FootageAccessLog.filter({ user_id: user.id, contest_id: contest.id }).catch(() => []),
        base44.entities.Submission.filter({ contest_id: contest.id }).catch(() => []),
      ]);
      setTermsAccepted(acceptance.length > 0);
      setAccessCount(logs.filter(l => !l.denied).length);
      const mySub = submissions.find(s => s.created_by_id === user.id);
      setHasJoined(!!mySub);
      setHasSubmitted(mySub?.status === 'submitted');
    };
    if (!isOwner && !isAdmin) checkStatus();
  }, [user?.id, contest.id, isOwner, isAdmin]);

  if (!contest.drive_link) return null;

  const contestEnded = ['winner_selected', 'completed'].includes(contest.status);
  const autoHidden = contestEnded && contest.auto_hide_drive_link && !isOwner && !isAdmin;

  if (autoHidden) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Footage access has expired</p>
          <p className="text-xs text-muted-foreground">This contest has ended and footage is no longer available.</p>
        </div>
      </div>
    );
  }

  if (contest.drive_link_removed) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Footage is no longer available</p>
          <p className="text-xs text-muted-foreground">The brand has removed the footage link.</p>
        </div>
      </div>
    );
  }

  if (isOwner || isAdmin) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Google Drive Footage</span>
          <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success">Protected</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {isAdmin ? 'Admin access — logs viewable only.' : 'You are the contest owner. Full access granted.'}
        </p>
        <a href={contest.drive_link} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Open Footage</Button>
        </a>
      </div>
    );
  }

  if (user?.user_role === 'client') {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Google Drive Footage</p>
          <p className="text-xs text-muted-foreground">Footage is available to participating creators only.</p>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Google Drive Footage</p>
          <p className="text-xs text-muted-foreground">Join the contest to access footage.</p>
        </div>
      </div>
    );
  }

  if (contest.disable_reaccess_after_submission && hasSubmitted && accessCount > 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Re-access disabled</p>
          <p className="text-xs text-muted-foreground">Footage access disabled after submission.</p>
        </div>
      </div>
    );
  }

  if (contest.allow_one_access && accessCount >= 1) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Access limit reached</p>
          <p className="text-xs text-muted-foreground">Single access only — you've already viewed this footage.</p>
        </div>
      </div>
    );
  }

  const logAccess = async (denied = false, reason = '') => {
    await base44.entities.FootageAccessLog.create({
      user_id: user.id,
      contest_id: contest.id,
      ip_address: 'client-side',
      user_agent: navigator.userAgent.slice(0, 200),
      device_type: getDeviceType(),
      access_count: accessCount + 1,
      denied,
      denial_reason: reason,
    });
  };

  const handleAcceptTerms = async () => {
    setShowTerms(false);
    setTermsAccepted(true);
    await base44.entities.TermsAcceptance.create({
      user_id: user.id,
      contest_id: contest.id,
      accepted: true,
      accepted_at: new Date().toISOString(),
    });
    await accessFootage();
  };

  const accessFootage = async () => {
    setAccessing(true);
    setError('');
    try {
      await logAccess(false);
      setAccessCount(prev => prev + 1);
      setRevealed(true);
    } catch (e) {
      setError('Failed to access footage. Please try again.');
    } finally {
      setAccessing(false);
    }
  };

  const handleAccessClick = () => {
    if (!termsAccepted) setShowTerms(true);
    else accessFootage();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Google Drive Footage</span>
        <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success">Protected</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        {revealed ? 'Footage access granted. Link is confidential — do not share.' : 'Secure access protected by Terms of Use.'}
      </p>
      {revealed ? (
        <div className="space-y-2">
          <a href={contest.drive_link} target="_blank" rel="noopener noreferrer">
            <Button className="w-full"><ExternalLink className="w-4 h-4 mr-2" /> Open Footage</Button>
          </a>
          <p className="text-[11px] text-muted-foreground text-center">Access logged · Do not redistribute</p>
        </div>
      ) : (
        <Button onClick={handleAccessClick} disabled={accessing} className="w-full">
          {accessing ? 'Verifying...' : <><Eye className="w-4 h-4 mr-2" /> Access Footage</>}
        </Button>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-card border border-border rounded-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <FileCheck className="w-5 h-5 text-primary" />
              <h3 className="font-heading font-bold">Terms of Use</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">I agree that:</p>
            <ul className="space-y-2.5 text-sm mb-5">
              <li className="flex items-start gap-2"><Check className="w-4 h-4 text-success mt-0.5 shrink-0" /><span>I will not redistribute this footage.</span></li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 text-success mt-0.5 shrink-0" /><span>I will not upload it elsewhere.</span></li>
              <li className="flex items-start gap-2"><Check className="w-4 h-4 text-success mt-0.5 shrink-0" /><span>I understand copyright violations will permanently suspend my account.</span></li>
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTerms(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleAcceptTerms} className="flex-1">Accept & Access</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}