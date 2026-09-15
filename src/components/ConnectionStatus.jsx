import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { onNetworkChange } from '@/lib/api';

/**
 * Tells the reader their connection dropped, and tells them when it came back.
 *
 * Without this, losing signal mid-session looks exactly like the product being
 * broken: buttons stop working, screens fail to load, and every error says
 * something generic about a request failing. The user blames RazeKit for their
 * tunnel. One honest line removes the whole class of confusion.
 *
 * Two states, deliberately asymmetric:
 *
 *   OFFLINE   persists. It is not a notification, it is a condition, and it
 *             stays up until the condition ends. Auto-dismissing it would hide
 *             the one fact that explains everything else on screen.
 *
 *   RECOVERED auto-dismisses after 3s. It is an event, and a permanent
 *             "you are online" badge is noise — being online is the default.
 *
 * It renders NOTHING in the normal case, so the overwhelming majority of
 * sessions pay no DOM, no layout and no paint for it.
 *
 * On honesty: `navigator.onLine === false` means the OS has no network
 * interface, which is a real fact worth reporting. `true` only means an
 * interface exists — a captive portal or a dead uplink still reports true — so
 * this never claims the connection *works*, only that the device reports one.
 * The API client enforces the same asymmetry.
 */
export default function ConnectionStatus() {
  // Start from the real current value rather than assuming online, so a reload
  // while offline shows the state immediately instead of waiting for an event
  // that already fired.
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [recovered, setRecovered] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => onNetworkChange((isOnline) => {
    setOnline(isOnline);
    if (!isOnline) { wasOffline.current = true; setRecovered(false); return; }
    // Only celebrate a recovery that followed an actual outage. Some browsers
    // fire `online` on load, and "Back online" when nothing went wrong is a lie
    // dressed as reassurance.
    if (wasOffline.current) { wasOffline.current = false; setRecovered(true); }
  }), []);

  useEffect(() => {
    if (!recovered) return undefined;
    const id = setTimeout(() => setRecovered(false), 3000);
    return () => clearTimeout(id);
  }, [recovered]);

  if (online && !recovered) return null;

  const isOffline = !online;

  return (
    <div
      // polite, not assertive: this must not interrupt a screen reader
      // mid-sentence, and it must never take focus away from what the user is
      // doing. They can finish their thought and then hear it.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        className={[
          'flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-medium shadow-lg',
          // Motion is a single short rise. It explains where the message came
          // from; it is not decoration. `prefers-reduced-motion` is handled
          // globally in index.css, which collapses the transform to nothing.
          'animate-[rk-rise_var(--dur-base)_var(--ease-emphasis)_both]',
          isOffline
            ? 'border-warning/25 bg-warning-wash text-warning'
            : 'border-success/25 bg-success-wash text-success',
        ].join(' ')}
      >
        {isOffline
          ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          : <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>
          {isOffline
            ? 'You’re offline. Changes won’t save until you reconnect.'
            : 'Back online.'}
        </span>
      </div>
    </div>
  );
}
