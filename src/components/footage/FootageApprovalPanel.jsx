import { useState, useEffect } from 'react';
import { Shield, Check, X, User, AlertTriangle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { logEvent } from './footage-utils';

export default function FootageApprovalPanel({ contest, user }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [approvedCount, setApprovedCount] = useState(0);

  const load = async () => {
    const [pendingReqs, allReqs] = await Promise.all([
      base44.entities.FootageAccessRequest.filter({ contest_id: contest.id, status: 'pending' }).catch(() => []),
      base44.entities.FootageAccessRequest.filter({ contest_id: contest.id, status: 'approved' }).catch(() => []),
    ]);
    setRequests(pendingReqs);
    setApprovedCount(allReqs.length);
    setLoading(false);
  };

  useEffect(() => {
    if (contest.created_by_id === user?.id) load();
    else setLoading(false);
  }, [contest.id, user?.id]);

  const maxEditorsReached = contest.max_editors && approvedCount >= contest.max_editors;

  const handleApprove = async (req) => {
    if (maxEditorsReached) {
      setError(`Maximum editors limit (${contest.max_editors}) reached.`);
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      await base44.entities.FootageAccessRequest.update(req.id, {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      });
      await logEvent(user.id, contest.id, 'approval', { request_id: req.id });

      // Email the contest's OTP to the worker
      if (contest.otp_code && req.worker_email) {
        await base44.integrations.Core.SendEmail({
          to: req.worker_email,
          subject: `Footage Access Code — ${contest.title}`,
          body: `Your access code for "${contest.title}" is: ${contest.otp_code}\n\nEnter this code in the contest page to access the footage.\n\nDo not share this code with anyone.`,
        }).catch(() => {});
      }

      // Notify the worker
      await base44.entities.Notification.create({
        type: 'system_announcement',
        title: 'Footage access approved',
        description: `Your access request for "${contest.title}" was approved. Check your email for the access code.`,
        contest_id: contest.id,
      }).catch(() => {});

      setRequests(prev => prev.filter(r => r.id !== req.id));
      setApprovedCount(prev => prev + 1);
    } catch (e) {
      setError('Failed to approve request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await base44.entities.FootageAccessRequest.update(rejecting.id, {
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectReason,
      });
      await logEvent(user.id, contest.id, 'rejection', { request_id: rejecting.id });

      if (rejecting.worker_email) {
        await base44.integrations.Core.SendEmail({
          to: rejecting.worker_email,
          subject: `Footage Access Update — ${contest.title}`,
          body: `Your footage access request for "${contest.title}" was not approved.\n\n${rejectReason ? `Reason: ${rejectReason}` : ''}`,
        }).catch(() => {});
      }

      await base44.entities.Notification.create({
        type: 'system_announcement',
        title: 'Footage access update',
        description: `Your access request for "${contest.title}" was not approved.`,
        contest_id: contest.id,
      }).catch(() => {});

      setRequests(prev => prev.filter(r => r.id !== rejecting.id));
      setRejecting(null);
      setRejectReason('');
    } catch (e) {
      setError('Failed to reject request.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || requests.length === 0) return null;

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Footage Access Requests</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">{requests.length}</span>
        {contest.max_editors && (
          <span className="text-xs text-muted-foreground ml-auto">{approvedCount}/{contest.max_editors} approved</span>
        )}
      </div>

      {contest.otp_code && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">On approval, the access code <span className="font-mono font-bold text-primary">{contest.otp_code}</span> will be emailed to the editor.</p>
        </div>
      )}

      <div className="space-y-2">
        {requests.map(req => (
          <div key={req.id} className="bg-surface border border-border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{req.worker_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{req.worker_email}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested {req.requested_at ? new Date(req.requested_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => handleApprove(req)} disabled={actionLoading || maxEditorsReached} className="flex-1">
                <Check className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(req)} className="flex-1">
                <X className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
            </div>
            {maxEditorsReached && <p className="text-xs text-destructive mt-2">Maximum editors limit reached.</p>}
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-destructive mt-2">{error}</p>}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setRejecting(null)} />
          <div className="relative bg-card border border-border rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h3 className="font-heading font-bold">Reject Request</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">Add a reason (optional):</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="w-full bg-input border border-border rounded-lg p-3 text-sm mb-4 focus:outline-none focus:border-primary"
              placeholder="Reason for rejection..."
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)} className="flex-1">Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={actionLoading} className="flex-1">
                {actionLoading ? 'Rejecting...' : 'Reject Request'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}