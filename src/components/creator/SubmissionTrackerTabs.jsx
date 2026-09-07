import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileVideo } from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import EmptyState from '@/components/ui/EmptyState';
import PlatformIcon from '@/components/social/PlatformIcon';
import { timeAgo } from '@/lib/social-tracker';

const SUB_META = {
  working: ['Draft', 'neutral'], upload_pending: ['Uploading', 'neutral'], uploading: ['Uploading', 'neutral'],
  processing: ['Processing', 'neutral'], ready_to_review: ['Submitted', 'info'], submitted: ['Submitted', 'info'],
  under_review: ['Under Review', 'accent'], shortlisted: ['Shortlisted', 'info'], won: ['Won', 'success'],
  lost: ['Not Selected', 'neutral'], not_selected: ['Not Selected', 'neutral'], withdrawn: ['Withdrawn', 'neutral'],
  upload_failed: ['Upload failed', 'danger'], processing_failed: ['Processing failed', 'danger'],
};

const TABS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'review', label: 'Under Review', match: (s) => ['ready_to_review', 'submitted', 'under_review'].includes(s.status) },
  { id: 'shortlisted', label: 'Shortlisted', match: (s) => s.status === 'shortlisted' },
  { id: 'won', label: 'Won', match: (s) => s.status === 'won' },
  { id: 'out', label: 'Not Selected', match: (s) => ['not_selected', 'lost', 'withdrawn'].includes(s.status) },
];

// My Submissions (§11): tabbed by lifecycle state, each row linking into its workflow.
export default function SubmissionTrackerTabs({ subs = [], contestsById = {} }) {
  const [tab, setTab] = useState('all');
  const rows = subs.filter(TABS.find((t) => t.id === tab).match);

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-card border border-border/60 text-muted-foreground hover:text-foreground'}`}
            aria-pressed={tab === t.id}
          >
            {t.label} <span className={tab === t.id ? 'text-primary-foreground/70' : 'text-muted-foreground/60'}>{subs.filter(t.match).length}</span>
          </button>
        ))}
      </div>

      {rows.length ? (
        <div className="glass-card rounded-2xl p-2">
          {rows.slice(0, 5).map((s) => {
            const [label, tone] = SUB_META[s.status] || [s.status, 'neutral'];
            const contest = contestsById[s.contest_id];
            const to = ['working', 'upload_pending', 'uploading', 'processing', 'upload_failed', 'processing_failed'].includes(s.status)
              ? `/contest/${s.contest_id}/work`
              : `/contest/${s.contest_id}`;
            return (
              <Link key={s.id} to={to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {s.platform ? <PlatformIcon platform={s.platform} className="w-4 h-4" /> : <FileVideo className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{contest?.title || 'Contest'}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.content_type || s.platform || ''}{s.submitted_at ? ` · ${timeAgo(s.submitted_at)}` : ''}</p>
                </div>
                <StatusPill tone={tone} className="shrink-0">{label}</StatusPill>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
          {rows.length > 5 && (
            <Link to="/my-contests" className="block text-center text-xs font-semibold text-primary p-3 hover:underline">View all submissions</Link>
          )}
        </div>
      ) : (
        <EmptyState
          icon={FileVideo}
          title={subs.length ? 'Nothing in this tab' : "You haven't submitted to a contest yet"}
          message={subs.length ? 'Submissions in this state will appear here.' : 'Find an open contest and submit your first entry.'}
          actionLabel={subs.length ? undefined : 'Find Contests'}
          to={subs.length ? undefined : '/explore'}
          className="py-6"
        />
      )}
    </div>
  );
}