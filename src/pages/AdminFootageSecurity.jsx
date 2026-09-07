import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Eye, AlertTriangle, Ban, Activity, Lock, ArrowLeft, FileCheck, Download, Clock, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const EVENT_LABELS = {
  request: { label: 'Access Requested', cls: 'text-blue-400', bg: 'bg-blue-400/10' },
  approval: { label: 'Approved', cls: 'text-success', bg: 'bg-success/10' },
  rejection: { label: 'Rejected', cls: 'text-destructive', bg: 'bg-destructive/10' },
  otp_generated: { label: 'OTP Generated', cls: 'text-primary', bg: 'bg-primary/10' },
  otp_verified: { label: 'OTP Verified', cls: 'text-success', bg: 'bg-success/10' },
  otp_failed: { label: 'OTP Failed', cls: 'text-destructive', bg: 'bg-destructive/10' },
  download_started: { label: 'Download Started', cls: 'text-blue-400', bg: 'bg-blue-400/10' },
  download_completed: { label: 'Download Completed', cls: 'text-success', bg: 'bg-success/10' },
  failed_attempt: { label: 'Failed Attempt', cls: 'text-amber-400', bg: 'bg-amber-400/10' },
  unauthorized_access: { label: 'Unauthorized Access', cls: 'text-destructive', bg: 'bg-destructive/10' },
  expired_session: { label: 'Expired Session', cls: 'text-amber-400', bg: 'bg-amber-400/10' },
  access: { label: 'Access', cls: 'text-muted-foreground', bg: 'bg-secondary' },
};

export default function AdminFootageSecurity() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('logs');
  const [stats, setStats] = useState({ protectedContests: 0, pendingRequests: 0, activeSessions: 0, totalAccesses: 0, suspiciousAttempts: 0 });
  const [logs, setLogs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
        if (me?.role !== 'admin') { setLoading(false); return; }

        const [contests, accessLogs, allRequests, allSessions] = await Promise.all([
          base44.entities.Contest.list('-created_date', 100),
          base44.entities.FootageAccessLog.list('-created_date', 50),
          base44.entities.FootageAccessRequest.list('-created_date', 50),
          base44.entities.DownloadSession.list('-created_date', 50),
        ]);

        const driveLinkContests = contests.filter(c => c.drive_link);
        const pendingReqs = allRequests.filter(r => r.status === 'pending');
        const activeSessions = allSessions.filter(s => s.status === 'active');
        const totalAccesses = accessLogs.filter(l => ['download_completed', 'access'].includes(l.event_type)).length;
        const suspicious = accessLogs.filter(l => ['unauthorized_access', 'otp_failed', 'failed_attempt', 'expired_session'].includes(l.event_type)).length;

        setStats({
          protectedContests: driveLinkContests.length,
          pendingRequests: pendingReqs.length,
          activeSessions: activeSessions.length,
          totalAccesses,
          suspiciousAttempts: suspicious,
        });
        setLogs(accessLogs);
        setRequests(allRequests);
        setSessions(allSessions);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
        <Link to="/" className="text-primary text-sm hover:underline mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const statCards = [
    { label: 'Protected Contests', value: stats.protectedContests, icon: Shield, color: 'text-primary' },
    { label: 'Pending Requests', value: stats.pendingRequests, icon: FileCheck, color: 'text-blue-500' },
    { label: 'Active Sessions', value: stats.activeSessions, icon: Download, color: 'text-green-500' },
    { label: 'Total Accesses', value: stats.totalAccesses, icon: Eye, color: 'text-cyan-400' },
    { label: 'Suspicious Events', value: stats.suspiciousAttempts, icon: AlertTriangle, color: 'text-amber-500' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Footage Security Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border border-border rounded-xl p-4">
              <Icon className={`w-5 h-5 ${s.color} mb-2`} />
              <p className="text-2xl font-heading font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mb-4">
        {['logs', 'requests', 'sessions'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity logged yet.</p>
          ) : logs.map(log => {
            const cfg = EVENT_LABELS[log.event_type] || EVENT_LABELS.access;
            return (
              <div key={log.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Activity className={`w-4 h-4 ${cfg.cls}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Contest {log.contest_id?.slice(0, 8)} · {log.device_type} · {new Date(log.created_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No access requests.</p>
          ) : requests.map(req => (
            <div key={req.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{req.worker_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {req.contest_title} · {new Date(req.requested_at || req.created_date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                req.status === 'approved' ? 'bg-success/10 text-success' :
                req.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                req.status === 'expired' ? 'bg-amber-400/10 text-amber-400' :
                'bg-primary/10 text-primary'
              }`}>{req.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No download sessions.</p>
          ) : sessions.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <Download className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Session {s.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  Downloads: {s.download_count} / {s.max_downloads} · Expires {new Date(s.expires_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                s.status === 'active' ? 'bg-success/10 text-success' :
                s.status === 'used' ? 'bg-secondary text-muted-foreground' :
                'bg-amber-400/10 text-amber-400'
              }`}>{s.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}