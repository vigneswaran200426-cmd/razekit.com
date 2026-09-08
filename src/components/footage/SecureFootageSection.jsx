import { useState, useEffect } from 'react';
import { Shield, Lock, CheckCircle, XCircle, AlertTriangle, Eye, Clock, RefreshCw, FileCheck, KeyRound, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import CountdownDisplay from './CountdownDisplay';
import { logEvent } from './footage-utils';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export default function SecureFootageSection({ contest, user, isOwner }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [error, setError] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [accessCount, setAccessCount] = useState(0);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const load = async () => {
      if (!user?.id) { setLoading(false); return; }
      const submissions = await base44.entities.Submission.filter({ contest_id: contest.id }).catch(() => []);
      setHasJoined(!!submissions.find(s => s.created_by_id === user.id));
      const requests = await base44.entities.FootageAccessRequest.filter({ worker_id: user.id, contest_id: contest.id }).catch(() => []);
      if (requests.length > 0) setRequest(requests[0]);
      const logs = await base44.entities.FootageAccessLog.filter({ user_id: user.id, contest_id: contest.id, event_type: 'download_completed' }).catch(() => []);
      setAccessCount(logs.length);
      setLoading(false);
    };
    if (!isOwner && !isAdmin) load();
    else setLoading(false);
  }, [user?.id, contest.id]);

  if (!contest.drive_link) return null;

  const contestEnded = ['winner_selected', 'completed'].includes(contest.status);
  const autoHidden = contestEnded && contest.auto_hide_drive_link && !isOwner && !isAdmin;

  if (autoHidden) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">This contest is no longer accepting footage requests.</p>
          <p className="text-xs text-muted-foreground">This contest has ended.</p>
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
          {contest.otp_code && <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">OTP: {contest.otp_code}</span>}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {isAdmin ? 'Admin access — all access is logged.' : 'You are the contest owner. Full access granted.'}
        </p>
        {contest.drive_link && (
          <a href={contest.drive_link} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><Eye className="w-3.5 h-3.5 mr-1" /> View Footage</Button>
          </a>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="bg-card border border-border rounded-xl p-4 mb-3 h-20 animate-pulse" />;
  }

  if (user?.user_role === 'client') {
    return (
      <div className="bg-card border border-border rounded-xl p-4 mb-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Protected Footage</p>
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
          <p className="text-xs text-muted-foreground">Join the contest to request footage access.</p>
        </div>
      </div>
    );
  }

  const handleRequest = async () => {
    setActionLoading(true);
    setError('');
    try {
      const req = await base44.entities.FootageAccessRequest.create({
        worker_id: user.id,
        worker_name: user.full_name || user.email,
        worker_email: user.email,
        contest_id: contest.id,
        contest_title: contest.title,
        client_id: contest.created_by_id,
        status: 'pending',
        requested_at: new Date().toISOString(),
        otp_attempts: 0,
        otp_verified: false,
      });
      await logEvent(user.id, contest.id, 'request', { request_id: req.id });
      // Email the worker: request submitted
      await base44.integrations.Core.SendEmail({
        to: user.email,
        subject: `Footage Access Request Submitted — ${contest.title}`,
        body: `Your footage access request for "${contest.title}" has been submitted.\n\nThe brand will review your request and approve access shortly. You will receive an email with the access code once approved.`,
      }).catch(() => {});
      // Notify the client
      await base44.entities.Notification.create({
        type: 'system_announcement',
        title: 'New editor joined',
        description: `${user.full_name || 'An editor'} requested footage access for "${contest.title}". Approve access.`,
        contest_id: contest.id,
      }).catch(() => {});
      setRequest(req);
    } catch (e) {
      setError('Failed to submit request. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const isLocked = request?.otp_locked_until && new Date(request.otp_locked_until) > new Date();
  const remainingAttempts = MAX_ATTEMPTS - (request?.otp_attempts || 0);

  const handleVerifyOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length !== 6) { setError('Enter all 6 digits'); return; }

    if (isLocked) {
      setError('Access locked. Try again after 15 minutes.');
      return;
    }

    setActionLoading(true);
    setError('');
    try {
      if (otp === contest.otp_code) {
        // Correct OTP
        await base44.entities.FootageAccessRequest.update(request.id, {
          otp_verified: true,
        });
        await logEvent(user.id, contest.id, 'otp_verified', { request_id: request.id });
        setRequest(prev => ({ ...prev, otp_verified: true }));
      } else {
        // Incorrect OTP
        const newAttempts = (request.otp_attempts || 0) + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
          await base44.entities.FootageAccessRequest.update(request.id, {
            otp_attempts: newAttempts,
            otp_locked_until: lockUntil,
          });
          setRequest(prev => ({ ...prev, otp_attempts: newAttempts, otp_locked_until: lockUntil }));
          setError('The verification code is incorrect. Access locked for 15 minutes.');
        } else {
          await base44.entities.FootageAccessRequest.update(request.id, {
            otp_attempts: newAttempts,
          });
          setRequest(prev => ({ ...prev, otp_attempts: newAttempts }));
          setError(`The verification code is incorrect. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining.`);
        }
        await logEvent(user.id, contest.id, 'otp_failed', { request_id: request.id, attempts: newAttempts });
        setOtpDigits(['', '', '', '', '', '']);
      }
    } catch (e) {
      setError('Verification failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDrive = async () => {
    await logEvent(user.id, contest.id, 'download_completed', { request_id: request?.id });
    setAccessCount(prev => prev + 1);
    window.open(contest.drive_link, '_blank');
  };

  const handleOtpDigitChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const newDigits = [...otpDigits];
    newDigits[i] = val;
    setOtpDigits(newDigits);
    if (val && i < 5) {
      const next = document.getElementById(`otp-${i + 1}`);
      next?.focus();
    }
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      document.getElementById(`otp-${i - 1}`)?.focus();
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Protected Footage</span>
        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">OTP Secured</span>
      </div>

      {/* No request yet */}
      {!request && (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            This footage is protected. Request access and the brand will review your request.
          </p>
          <Button onClick={handleRequest} disabled={actionLoading} className="w-full">
            {actionLoading ? 'Submitting...' : <><FileCheck className="w-4 h-4 mr-2" /> Request Footage Access</>}
          </Button>
        </>
      )}

      {/* Request pending */}
      {request && request.status === 'pending' && (
        <div className="flex items-center gap-3 py-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-primary animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-medium">Waiting for Brand Approval</p>
                  <p className="text-xs text-muted-foreground">The brand will review your request and send the access code.</p>
          </div>
        </div>
      )}

      {/* Request rejected */}
      {request && request.status === 'rejected' && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-destructive">Access Denied</p>
              <p className="text-xs text-muted-foreground">
                {request.rejection_reason || 'You do not have permission to access this footage.'}
              </p>
            </div>
          </div>
          <Button onClick={handleRequest} disabled={actionLoading} variant="outline" className="w-full">
            {actionLoading ? 'Submitting...' : <><RefreshCw className="w-4 h-4 mr-2" /> Request Again</>}
          </Button>
        </div>
      )}

      {/* Request approved — OTP entry */}
      {request && request.status === 'approved' && !request.otp_verified && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">OTP Sent</p>
              <p className="text-xs text-muted-foreground">Enter the 6-digit access code sent to your email.</p>
            </div>
          </div>

          {isLocked ? (
            <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-3 mb-3">
              <Lock className="w-4 h-4 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Access locked for 15 minutes</p>
                <p className="text-xs text-muted-foreground">Too many incorrect attempts.</p>
              </div>
              <CountdownDisplay expiresAt={request.otp_locked_until} className="text-sm font-bold text-destructive" />
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3 justify-center">
                {otpDigits.map((d, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-10 h-12 text-center text-xl font-bold bg-input border border-border rounded-lg focus:border-primary focus:outline-none text-foreground"
                  />
                ))}
              </div>
              <Button onClick={handleVerifyOtp} disabled={actionLoading || otpDigits.join('').length !== 6} className="w-full">
                {actionLoading ? 'Verifying...' : 'Verify'}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">{remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining</p>
            </>
          )}
        </div>
      )}

      {/* OTP verified — access granted */}
      {request && request.status === 'approved' && request.otp_verified && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-success">Access Granted</p>
              <p className="text-xs text-muted-foreground">You can now access the Google Drive footage.</p>
            </div>
          </div>
          <Button onClick={handleOpenDrive} className="w-full">
            <ExternalLink className="w-4 h-4 mr-2" /> Open Google Drive
          </Button>
          {contest.max_downloads > 1 && (
            <p className="text-xs text-muted-foreground text-center mt-2">Accesses: {accessCount} / {contest.max_downloads}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}