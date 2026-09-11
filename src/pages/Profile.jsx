// Profile — the one place a member edits how they appear across RazeKit.
//
// Editing is unchanged: the same two fields, the same single updateMe call,
// the same refresh. What is added around it is orientation — what of this
// account is public, where that public page is, and what is measured about it —
// plus the one thing this screen refuses to put on a public page: money. A
// member's earnings, balance and payouts are private to them and live in
// Balance, so nothing here totals them up or hints at them.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock, ExternalLink, AlertCircle, RotateCcw, BarChart3, Megaphone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { auth, entities, fn } from '@/lib/api';
import {
  PageHeader, Card, Button, Input, Label, Avatar, Badge, Skeleton, Metric,
} from '@/components/ui';

const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** A measured-performance strip, or an honest reason there isn't one. */
function CreatorPerformance({ userId }) {
  const [data, setData] = useState(undefined);

  const load = useCallback(() => {
    if (!userId) return;
    setData(undefined);
    fn('creatorPublicProfile', { creator_id: userId }).then(setData).catch(() => setData(null));
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Your measured performance</h2>

      {data === undefined ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
        </div>
      ) : data === null ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="flex items-start gap-1.5 text-[13px] text-muted">
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            Your performance figures did not load.
          </p>
          <Button variant="secondary" size="sm" onClick={load}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Metric label="Contests scored" value={num(data.contests_scored)} />
            <Metric label="Average final score" value={num(data.average_final_score)} />
            <Metric label="Best final score" value={num(data.best_final_score)} />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <BarChart3 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Produced by RazeKit’s scoring engine from finalized contests. A dimension that was never measured shows as
            “Not measured” rather than as a zero.
          </p>
        </>
      )}
    </Card>
  );
}

/** The brand equivalent: what this account has actually run. */
function ClientCampaigns({ userId }) {
  const [rows, setRows] = useState(undefined);

  const load = useCallback(() => {
    if (!userId) return;
    setRows(undefined);
    entities.Contest.filter({ created_by_id: userId }, '-created_date', 60)
      .then((l) => setRows(l || []))
      .catch(() => setRows(null));
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const running = (rows || []).filter((c) => !['completed', 'winner_selected', 'draft'].includes(c.status)).length;
  const completed = (rows || []).filter((c) => ['completed', 'winner_selected'].includes(c.status)).length;

  return (
    <Card className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Your campaigns</h2>

      {rows === undefined ? (
        <div className="mt-4 grid grid-cols-3 gap-4" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
        </div>
      ) : rows === null ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="flex items-start gap-1.5 text-[13px] text-muted">
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            Your campaigns did not load.
          </p>
          <Button variant="secondary" size="sm" onClick={load}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Metric label="Published" value={rows.length} />
            <Metric label="Running" value={running} />
            <Metric label="Completed" value={completed} />
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
            <Megaphone className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Completed collaborations are listed on your public profile. What you spent is not.
          </p>
        </>
      )}
    </Card>
  );
}

export default function Profile() {
  const { user, refresh, role } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // Display-only: tells the member their edits are not committed yet.
  const dirty = fullName !== (user?.full_name || '') || bio !== (user?.bio || '');

  const save = async () => {
    setSaving(true); setSaved(false); setErr('');
    try {
      await auth.updateMe({ full_name: fullName.trim(), bio: bio.trim() });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e?.data?.error?.message || e.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Profile" description="How you appear across RazeKit." />

      {/* Identity — the account as it stands, read only. */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <Avatar name={user?.full_name || user?.email} size={64} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold text-ink sm:text-xl">{user?.full_name || 'Your name'}</p>
            <p className="truncate text-sm text-muted">{user?.email}</p>
            <Badge tone="primary" className="mt-1.5 capitalize">{user?.user_role || 'visitor'}</Badge>
          </div>
        </div>

        {user?.id && (
          <Link
            to={`/u/${user.id}`}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-semibold text-ink transition-colors hover:border-primary/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:w-auto"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            View your public profile
          </Link>
        )}
      </Card>

      {/* The editable half — one card, one primary action. */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Your details</h2>

        {/* The hint is tied to its control with aria-describedby, so it is read
            out with the field rather than stranded after it. */}
        <div className="mt-4 space-y-5">
          <div>
            <Label htmlFor="fn">Full name</Label>
            <Input
              id="fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              aria-describedby="fn-help"
            />
            <p id="fn-help" className="mt-1.5 text-[12px] text-muted">
              Shown wherever your work appears: entries, results and winner cards.
            </p>
          </div>

          <div>
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell brands about your work…"
              aria-describedby="bio-help"
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p id="bio-help" className="mt-1.5 text-[12px] text-muted">
              A line or two on what you make and who you make it for.
            </p>
          </div>
        </div>

        {err && <p role="alert" className="mt-5 rounded-md bg-danger/8 px-3 py-2 text-sm text-danger">{err}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button loading={saving} onClick={save} className="min-h-[44px] w-full sm:w-auto">Save changes</Button>
          <p role="status" aria-live="polite" className="text-sm">
            {saved ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <Check className="h-4 w-4" aria-hidden="true" />
                Saved
              </span>
            ) : dirty ? (
              <span className="text-muted">Unsaved changes</span>
            ) : null}
          </p>
        </div>
      </Card>

      {role === 'client' ? <ClientCampaigns userId={user?.id} /> : <CreatorPerformance userId={user?.id} />}

      {/* Privacy — stated on the screen where a member decides what to share. */}
      <Card className="p-4 sm:p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">What other people can see</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink/90">
          <li>Your name, bio and the work you publish, on your public profile.</li>
          <li>Contests you have won or run, once their results are finalized.</li>
          <li>The published prize of those contests — which is the contest’s figure, not a payout.</li>
        </ul>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Your earnings, balance, payouts and payment details are never shown on a public profile. They stay in{' '}
          <Link to="/balance" className="font-semibold text-primary hover:underline">Balance</Link>.
        </p>
      </Card>
    </div>
  );
}
