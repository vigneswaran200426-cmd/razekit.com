import { ShieldAlert } from 'lucide-react';

// Permanent safety banner — shown on every handover screen.
export default function SecurityBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5">
      <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <p className="text-xs font-semibold text-destructive leading-relaxed">
        Never share passwords, 2FA codes, or recovery codes here. Access is granted through managed invites, not by sharing credentials.
      </p>
    </div>
  );
}