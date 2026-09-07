import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { KeyRound, FolderDown, ArrowLeftRight, ShieldAlert } from 'lucide-react';
import HandoverShell from '@/components/handover/HandoverShell';
import SecurityBanner from '@/components/handover/SecurityBanner';

// The core of the handover: a GUIDE ONLY. No password field, no credential
// transfer of any kind exists anywhere in this flow.
export default function HandoverGuide() {
  const { id } = useParams();
  return (
    <HandoverShell contestId={id} active="guide">
      {() => (
        <div className="space-y-4">
          <SecurityBanner />

          <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading font-bold text-base">Handing over account access</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Grant the winner access through the platform's own native tools — never by sharing credentials.
            </p>
            <ol className="space-y-3">
              {[
                'Open your platform\'s own admin tools — for example Instagram / Meta Business Suite.',
                'Invite the winner as a collaborator or manager using their handle.',
                'Assign only the access level this project needs — nothing broader.',
                'The winner confirms access in Razekit, and you confirm the handover to unlock payment.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
            <div className="flex items-start gap-2.5 mt-4 rounded-xl bg-secondary/60 p-3.5">
              <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Accounts, passwords, 2FA and recovery codes are <span className="font-semibold text-foreground">NEVER transferred</span> and{' '}
                <span className="font-semibold text-foreground">NEVER typed into Razekit</span>.
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 card-shadow">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <FolderDown className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-heading font-bold text-base">Delivering assets / files</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              The winner delivers the final video plus source/project files through the handover room.
            </p>
            <ol className="space-y-3">
              {[
                'The winner shares the final video and source/project files in the handover room.',
                'You review everything and download what you need.',
                'You confirm the handover in Razekit — payment is unlocked once both sides confirm.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          <Button asChild className="w-full h-12 text-base font-semibold" size="lg">
            <Link to={`/contest/${id}/handover/room`}>
              <ArrowLeftRight className="w-4 h-4 mr-2" /> Open Handover Room
            </Link>
          </Button>
        </div>
      )}
    </HandoverShell>
  );
}