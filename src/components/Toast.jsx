// Contextual notification system (spec 15/16).
//
// These are product guidance, not social notifications. Each answers: what
// happened, why it matters, what to do next. Standard guidance is
// non-dismissible with a 3-second lifecycle and at most one primary action.
// Fraud/security notifications additionally leave a persistent contextual
// warning that stays while the underlying issue is active.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, AlertTriangle, ShieldAlert, Trophy } from 'lucide-react';

const ToastCtx = createContext({ notify: () => {}, warnings: [], clearWarning: () => {} });
export const useToast = () => useContext(ToastCtx);

const LIFETIME_MS = 3000;      // spec: default display 3 seconds
const ENTRANCE_MS = 200;       // 0.15–0.25s entrance

// Event → guidance + single action (spec 15 table). Copy lives here so no
// component invents its own wording.
export const EVENTS = {
  contest_created:     { tone: 'success', icon: CheckCircle2, message: 'Your contest has been saved.', action: 'View contest' },
  payment_verified:    { tone: 'success', icon: CheckCircle2, message: 'Your payment has been verified and the contest is now funded.', action: 'View contest' },
  submission_received: { tone: 'success', icon: CheckCircle2, message: 'Your submission was successfully received.', action: 'View submission' },
  contest_ending:      { tone: 'info',    icon: Info,         message: 'This contest closes soon. Make sure your submission is complete.', action: 'View contest' },
  winner_finalized:    { tone: 'winner',  icon: Trophy,       message: 'The contest winner has been finalized and the result is official.', action: 'View winner' },
  analytics_delayed:   { tone: 'warning', icon: AlertTriangle, message: 'Some analytics are delayed and your score may remain provisional.', action: 'View Tracker' },
  payout_completed:    { tone: 'success', icon: CheckCircle2, message: 'Your prize payout has been completed.', action: 'View earnings' },
};

// Fraud/security wording (spec 16). Deliberately vague about detection:
// never reveal thresholds, never make an unsupported accusation.
export const SECURITY_EVENTS = {
  suspicious_traffic:  { severity: 'medium', message: 'Some campaign traffic could not be verified and may be excluded from your performance score.', action: 'Review Tracker', to: '/tracker' },
  abnormal_activity:   { severity: 'high',   message: 'Unusual traffic activity was detected and is being reviewed.', action: 'View status', to: '/tracker' },
  invalid_event:       { severity: 'low',    message: 'A tracking event could not be verified and was excluded from performance calculations.', action: 'View Tracker', to: '/tracker' },
  repeated_self_traffic: { severity: 'medium', message: 'Repeated traffic from the same source was detected and may not count toward verified campaign traffic.', action: 'View status', to: '/tracker' },
  engagement_anomaly:  { severity: 'medium', message: 'Some engagement activity could not be verified and may be excluded from scoring.', action: 'View performance', to: '/tracker' },
  fraud_review:        { severity: 'high',   message: 'Your campaign activity is temporarily under review. Final scoring may be delayed.', action: 'View status', to: '/tracker' },
  security_event:      { severity: 'critical', message: 'RazeKit detected unusual account activity. Review your account security.', action: 'Review security', to: '/settings' },
};

const TONE = {
  success: 'border-success/30 bg-success/[0.06] text-success',
  info: 'border-primary/30 bg-primary/[0.06] text-primary',
  warning: 'border-warning/40 bg-warning/[0.08] text-[#8a5300]',
  danger: 'border-danger/30 bg-danger/[0.06] text-danger',
  winner: 'border-primary/40 bg-primary/[0.08] text-primary',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [warnings, setWarnings] = useState([]); // persistent security context
  const seen = useRef(new Set());               // dedupe (spec: no duplicates)

  const notify = useCallback((event, opts = {}) => {
    const preset = EVENTS[event] || SECURITY_EVENTS[event];
    if (!preset && !opts.message) return;

    const isSecurity = Boolean(SECURITY_EVENTS[event]);
    const id = opts.id || `${event}:${opts.to || ''}`;

    // Deduplicate identical guidance in a short window.
    if (seen.current.has(id)) return;
    seen.current.add(id);
    setTimeout(() => seen.current.delete(id), LIFETIME_MS * 2);

    const toast = {
      key: `${id}:${toasts.length}:${performance.now()}`,
      message: opts.message || preset.message,
      action: opts.action || preset.action,
      to: opts.to || preset.to,
      tone: isSecurity ? (SECURITY_EVENTS[event].severity === 'critical' ? 'danger' : 'warning') : (preset?.tone || 'info'),
      icon: isSecurity ? ShieldAlert : (preset?.icon || Info),
    };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.key !== toast.key)), LIFETIME_MS);

    // MEDIUM+ security events also leave a persistent contextual warning.
    const sev = isSecurity ? SECURITY_EVENTS[event].severity : null;
    if (sev && sev !== 'low') {
      setWarnings((w) => (w.some((x) => x.id === id) ? w : [...w, { id, ...SECURITY_EVENTS[event] }]));
    }
  }, [toasts.length]);

  const clearWarning = useCallback((id) => setWarnings((w) => w.filter((x) => x.id !== id)), []);

  const value = useMemo(() => ({ notify, warnings, clearWarning }), [notify, warnings, clearWarning]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastCtx.Provider>
  );
}

function ToastViewport({ toasts }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[1000] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.icon;
          return (
            <motion.div
              key={t.key}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: ENTRANCE_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto w-full max-w-md rounded-lg border px-4 py-3 shadow-md backdrop-blur bg-surface ${TONE[t.tone] || TONE.info}`}
            >
              <div className="flex items-start gap-2.5">
                <Icon className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                <p className="flex-1 text-[13px] leading-snug text-ink">{t.message}</p>
                {/* At most ONE primary action; no close button (spec 15). */}
                {t.to && t.action && (
                  <Link to={t.to} className="shrink-0 text-[12px] font-semibold text-primary hover:underline">
                    {t.action}
                  </Link>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}

/** Persistent security banner — stays while the issue is active (spec 16). */
export function SecurityWarnings() {
  const { warnings } = useToast();
  if (!warnings.length) return null;
  return (
    <div className="space-y-2">
      {warnings.map((w) => (
        <div
          key={w.id}
          className={`rounded-lg border px-4 py-3 ${w.severity === 'critical' ? 'border-danger/30 bg-danger/[0.06]' : 'border-warning/40 bg-warning/[0.07]'}`}
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className={`w-4 h-4 shrink-0 mt-px ${w.severity === 'critical' ? 'text-danger' : 'text-warning'}`} aria-hidden="true" />
            <p className="flex-1 text-[13px] leading-snug text-ink">{w.message}</p>
            {w.to && <Link to={w.to} className="shrink-0 text-[12px] font-semibold text-primary hover:underline">{w.action}</Link>}
          </div>
        </div>
      ))}
    </div>
  );
}
