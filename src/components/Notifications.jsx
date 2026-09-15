// The single notification surface for the browser.
//
// The backend already has one notification path (server/src/notify/emit.ts):
// every real event is persisted first, then delivered. This file is the mirror
// of that on the client — one provider that polls the persisted feed, one place
// that decides how a notification is shown, and one read-state.
//
//   notificationFeed -> provider -> contextual toast + persistent alert + bell
//
// Two display rules, and they are not interchangeable:
//   • ordinary guidance appears, holds ~3s, and leaves. No close button — it is
//     not asking for a decision, so it must not demand one.
//   • severity 'critical' (or persistent) does NOT leave on a timer. A failed
//     payout or a security event stays on screen while the issue is live and is
//     cleared by acting on it, never by waiting.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowDownToLine, Banknote, Bell, CheckCircle2, FileCheck2,
  Info, LifeBuoy, ShieldAlert, Target, Trophy,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';

const POLL_MS = 30000;
const HOLD_MS = 2600;   // removal is scheduled here; the exit finishes at ~3.0s
const ENTER_S = 0.2;
const EXIT_S = 0.4;
const MAX_TOASTS = 3;
const MAX_ALERTS = 2;

/* ── Category vocabulary (shared with the notification centre page) ──────── */
export const CATEGORY_META = {
  contest:    { label: 'Campaign',   icon: Target,          tone: 'text-primary' },
  submission: { label: 'Submission', icon: FileCheck2,      tone: 'text-primary' },
  winner:     { label: 'Winner',     icon: Trophy,          tone: 'text-warning' },
  payment:    { label: 'Funding',    icon: Banknote,        tone: 'text-ink' },
  payout:     { label: 'Payout',     icon: ArrowDownToLine, tone: 'text-success' },
  support:    { label: 'Support',    icon: LifeBuoy,        tone: 'text-primary' },
  security:   { label: 'Security',   icon: ShieldAlert,     tone: 'text-danger' },
  system:     { label: 'System',     icon: Bell,            tone: 'text-muted' },
};
export const categoryMeta = (c) => CATEGORY_META[c] || CATEGORY_META.system;

/** The one action a notification offers, named after where it actually goes. */
export function actionLabel(url) {
  const u = String(url || '');
  if (!u) return '';
  if (u.includes('/verify')) return 'Verify account';
  if (u.includes('/fund')) return 'Open funding';
  if (u.includes('/review')) return 'Review entry';
  if (u.startsWith('/balance')) return 'View balance';
  if (u.startsWith('/tracker')) return 'View Tracker';
  if (u.startsWith('/settings')) return 'Review security';
  if (u.startsWith('/admin')) return 'Open admin';
  if (u.startsWith('/contest/')) return 'View campaign';
  return 'Open';
}

export function notificationTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  if (ms < 60000) return 'Just now';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ── Client-side guidance catalogue (kept for existing notify() callers) ─── */
export const EVENTS = {
  contest_created:     { severity: 'info',      icon: CheckCircle2, title: 'Your campaign has been saved.', action: 'View campaign' },
  payment_verified:    { severity: 'important', icon: CheckCircle2, title: 'Your funding has been verified and the campaign is live.', action: 'View campaign' },
  submission_received: { severity: 'info',      icon: CheckCircle2, title: 'Your submission was received.', action: 'View submission' },
  contest_ending:      { severity: 'important', icon: Info,         title: 'This campaign closes soon. Make sure your entry is complete.', action: 'View campaign' },
  winner_finalized:    { severity: 'important', icon: Trophy,       title: 'The winner has been finalised and the result is official.', action: 'View winner' },
  analytics_delayed:   { severity: 'important', icon: AlertTriangle, title: 'Some analytics are delayed. Your score stays provisional until they arrive.', action: 'View Tracker' },
  payout_completed:    { severity: 'important', icon: CheckCircle2, title: 'Your prize payout has been processed.', action: 'View balance' },
};

// Deliberately vague about detection: never reveal a threshold, never make an
// accusation the backend has not confirmed.
export const SECURITY_EVENTS = {
  suspicious_traffic:    { severity: 'important', title: 'Some campaign traffic could not be verified and may be excluded from your score.', action: 'Review Tracker', to: '/tracker' },
  abnormal_activity:     { severity: 'critical',  title: 'Unusual traffic activity was detected and is being reviewed.', action: 'View status', to: '/tracker' },
  invalid_event:         { severity: 'info',      title: 'A tracking event could not be verified and was excluded from scoring.', action: 'View Tracker', to: '/tracker' },
  repeated_self_traffic: { severity: 'important', title: 'Repeated traffic from the same source may not count toward verified traffic.', action: 'View status', to: '/tracker' },
  engagement_anomaly:    { severity: 'important', title: 'Some engagement could not be verified and may be excluded from scoring.', action: 'View performance', to: '/tracker' },
  fraud_review:          { severity: 'critical',  title: 'Your campaign activity is under review. Final scoring may be delayed.', action: 'View status', to: '/tracker' },
  security_event:        { severity: 'critical',  title: 'Unusual account activity was detected. Review your account security.', action: 'Review security', to: '/settings' },
};

/* ── Context ────────────────────────────────────────────────────────────── */
const FALLBACK = {
  // `mounted` lets a consumer tell an unmounted provider from a real one and
  // fall back to calling the API directly rather than silently doing nothing.
  mounted: false,
  notify: () => {}, warnings: [], clearWarning: () => {},
  feed: null, unread: 0, unreadByCategory: {}, criticals: [], categories: [],
  error: '', refresh: () => {}, markRead: () => {}, markAllRead: () => {},
};
const Ctx = createContext(FALLBACK);

/** Compatible with the previous Toast.jsx surface: { notify, warnings, clearWarning }. */
export const useToast = () => useContext(Ctx);
export const useNotifications = () => useContext(Ctx);

export function NotificationProvider({ children }) {
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const reduce = useReducedMotion();

  const [feed, setFeed] = useState(null);
  const [unread, setUnread] = useState(0);
  const [unreadByCategory, setUnreadByCategory] = useState({});
  const [criticals, setCriticals] = useState([]);   // live issues, from the server
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);
  const [warnings, setWarnings] = useState([]);     // client-emitted, in-page

  const seen = useRef(new Set());   // dedupe: a poll never re-toasts an id
  const primed = useRef(false);     // the first load is history, not news
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const push = useCallback((toast) => {
    setToasts((cur) => {
      if (cur.some((t) => t.key === toast.key)) return cur;
      return [...cur, toast].slice(-MAX_TOASTS);
    });
    timers.current.push(setTimeout(
      () => setToasts((cur) => cur.filter((t) => t.key !== toast.key)),
      HOLD_MS,
    ));
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fn('notificationFeed', { limit: 40 });
      const list = r?.notifications || [];
      setFeed(list);
      setUnread(r?.unread || 0);
      setUnreadByCategory(r?.unread_by_category || {});
      setCriticals(r?.active_critical || []);
      setCategories(r?.categories || Object.keys(CATEGORY_META));
      setError('');

      const first = !primed.current;
      primed.current = true;
      for (const n of list) {
        if (seen.current.has(n.id)) continue;
        seen.current.add(n.id);
        // Critical items are rendered from active_critical and stay put, so a
        // transient toast for them would only duplicate the alert.
        if (first || n.read || n.persistent || n.severity === 'critical') continue;
        push({
          key: `n:${n.id}`,
          title: n.title,
          body: n.body,
          severity: n.severity || 'info',
          category: n.category || 'system',
          to: n.action_url,
          action: actionLabel(n.action_url),
        });
      }
    } catch (e) {
      if (e?.status === 401) return;
      setError('Live notification updates are unavailable right now. Reload to try again.');
    }
  }, [push]);

  useEffect(() => {
    if (!authed) {
      seen.current = new Set();
      primed.current = false;
      setFeed(null); setUnread(0); setUnreadByCategory({}); setCriticals([]); setToasts([]);
      return undefined;
    }
    load();
    const iv = setInterval(load, POLL_MS);
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [authed, load]);

  const markRead = useCallback(async (ids) => {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;
    setFeed((f) => (f ? f.map((n) => (list.includes(n.id) ? { ...n, read: true } : n)) : f));
    setCriticals((c) => c.filter((n) => !list.includes(n.id)));
    setUnread((u) => Math.max(0, u - list.length));
    try { await fn('notificationRead', { ids: list }); } catch { /* reconciled by load() */ }
    load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    setFeed((f) => (f ? f.map((n) => ({ ...n, read: true })) : f));
    setCriticals([]); setUnread(0); setUnreadByCategory({});
    try { await fn('notificationRead', { all: true }); } catch { /* reconciled by load() */ }
    load();
  }, [load]);

  /**
   * Show client-side guidance. Accepts the old event-key form
   * notify('payment_verified', { to }) and a plain object { title, body, ... }.
   */
  const notify = useCallback((event, opts = {}) => {
    const isObj = event && typeof event === 'object';
    const preset = isObj ? null : (EVENTS[event] || SECURITY_EVENTS[event]);
    const src = isObj ? event : opts;
    const title = src.title || src.message || preset?.title;
    if (!title) return;

    const severity = src.severity || preset?.severity || 'info';
    const to = src.to || src.actionUrl || preset?.to || null;
    const id = src.id || (isObj ? title : `${event}:${to || ''}`);
    if (seen.current.has(id)) return;
    seen.current.add(id);
    timers.current.push(setTimeout(() => seen.current.delete(id), HOLD_MS * 2));

    const isSecurity = !isObj && Boolean(SECURITY_EVENTS[event]);
    const entry = {
      id,
      title,
      body: src.body || '',
      severity,
      category: src.category || (isSecurity ? 'security' : 'system'),
      to,
      action: src.action || src.actionLabel || preset?.action || actionLabel(to),
      icon: src.icon || preset?.icon || null,
    };

    // Critical guidance is not a toast: it stays until it is acted on.
    if (severity === 'critical') setWarnings((w) => (w.some((x) => x.id === id) ? w : [...w, entry]));
    else push({ ...entry, key: `c:${id}:${Date.now()}` });
  }, [push]);

  const clearWarning = useCallback((id) => setWarnings((w) => w.filter((x) => x.id !== id)), []);

  const value = useMemo(() => ({
    mounted: true,
    notify, warnings, clearWarning,
    feed, unread, unreadByCategory, criticals, categories, error,
    refresh: load, markRead, markAllRead,
  }), [notify, warnings, clearWarning, feed, unread, unreadByCategory, criticals, categories, error, load, markRead, markAllRead]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Viewport toasts={toasts} criticals={criticals} onHandled={markRead} reduce={reduce} />
    </Ctx.Provider>
  );
}

/* ── Viewport: desktop top-right, mobile full-width under the header ─────── */
function Viewport({ toasts, criticals, onHandled, reduce }) {
  if (typeof document === 'undefined') return null;
  const alerts = criticals.slice(0, MAX_ALERTS);
  const extra = criticals.length - alerts.length;
  if (!alerts.length && !toasts.length) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col gap-2 px-3 sm:left-auto sm:right-0 sm:w-[400px] sm:px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4.75rem)' }}
    >
      {/* Live issues. Assertive, and never removed by a timer. */}
      <div role="alert" className="flex flex-col gap-2">
        {alerts.map((n) => <Alert key={n.id} n={n} onHandled={onHandled} />)}
        {extra > 0 && (
          <Link to="/notifications" className="pointer-events-auto inline-flex min-h-[44px] items-center justify-center rounded-md border border-danger/30 bg-surface px-3 text-[13px] font-semibold text-danger shadow-xs">
            {extra} more {extra === 1 ? 'issue needs' : 'issues need'} attention
          </Link>
        )}
      </div>

      {/* Ordinary guidance. Polite, no close button, gone in ~3s. */}
      <ul role="status" aria-live="polite" className="flex flex-col gap-2 m-0 list-none p-0">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const meta = categoryMeta(t.category);
            const Icon = t.icon || meta.icon;
            return (
              <motion.li
                key={t.key}
                initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
                animate={reduce ? {} : { opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, scale: 0.98, transition: { duration: EXIT_S, ease: [0.4, 0, 1, 1] } }}
                transition={{ duration: ENTER_S, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'pointer-events-auto w-full rounded-lg border bg-surface px-3.5 py-3 shadow-md',
                  t.severity === 'important' ? 'border-line-strong' : 'border-line',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.tone)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-snug text-ink break-words">{t.title}</p>
                    {t.body && <p className="mt-0.5 text-[12px] leading-snug text-muted line-clamp-2 break-words">{t.body}</p>}
                  </div>
                </div>
                {t.to && t.action && (
                  <Link to={t.to} className="mt-1 ml-[26px] inline-flex min-h-[44px] items-center text-[12px] font-semibold text-primary hover:underline sm:min-h-0 sm:py-1">
                    {t.action}
                  </Link>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>,
    document.body,
  );
}

function Alert({ n, onHandled }) {
  const meta = categoryMeta(n.category);
  const Icon = meta.icon;
  const label = actionLabel(n.action_url);
  return (
    <div className="pointer-events-auto w-full rounded-lg border border-danger/30 bg-surface px-3.5 py-3 shadow-md">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-danger">{meta.label} · Needs action</p>
          <p className="mt-0.5 text-[13px] font-semibold leading-snug text-ink break-words">{n.title}</p>
          {n.body && <p className="mt-0.5 text-[12px] leading-snug text-muted break-words">{n.body}</p>}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 pl-[26px]">
        {n.action_url && (
          <Link to={n.action_url} className="inline-flex min-h-[44px] items-center text-[12px] font-semibold text-primary hover:underline sm:min-h-0 sm:py-1">
            {label}
          </Link>
        )}
        {/* Cleared by acknowledging it, never by a timer. */}
        <button type="button" onClick={() => onHandled(n.id)} className="inline-flex min-h-[44px] items-center text-[12px] font-medium text-muted hover:text-ink sm:min-h-0 sm:py-1">
          Mark as handled
        </button>
      </div>
    </div>
  );
}

/* ── In-page persistent warnings (client-emitted, e.g. traffic checks) ───── */
export function SecurityWarnings({ className }) {
  const { warnings, clearWarning } = useNotifications();
  if (!warnings.length) return null;
  return (
    <div className={cn('space-y-2', className)}>
      {warnings.map((w) => (
        <div key={w.id} className="rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3" role="alert">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-ink break-words">{w.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {w.to && <Link to={w.to} className="inline-flex min-h-[44px] items-center text-[12px] font-semibold text-primary hover:underline sm:min-h-0">{w.action}</Link>}
                <button type="button" onClick={() => clearWarning(w.id)} className="inline-flex min-h-[44px] items-center text-[12px] font-medium text-muted hover:text-ink sm:min-h-0">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Bell ───────────────────────────────────────────────────────────────── */
export function NotificationBell({ className }) {
  const { unread } = useNotifications();
  return (
    <Link
      to="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className={cn('relative grid h-11 w-11 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', className)}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && (
        <span className="nums absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white ring-2 ring-surface">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

// Back-compat alias: App.jsx may still mount <ToastProvider>.
export const ToastProvider = NotificationProvider;
export default NotificationProvider;
