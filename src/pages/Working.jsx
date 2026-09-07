import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Clock, ExternalLink, Upload, ArrowLeft, FileVideo, History } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CountdownTimer from '@/components/CountdownTimer';

const STATUS_LABEL = {
  working: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  won: 'Winner',
  lost: 'Not selected',
  not_selected: 'Not selected',
  withdrawn: 'Withdrawn',
};

export default function Working() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState(null);
  const [versions, setVersions] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contestData, userData, subs] = await Promise.all([
          base44.entities.Contest.get(id),
          base44.auth.me().catch(() => null),
          base44.entities.Submission.filter({ contest_id: id }, '-created_date', 50).catch(() => []),
        ]);
        setContest(contestData);
        setUser(userData);
        setVersions(subs.filter((s) => s.created_by_id === userData?.id));
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!contest) return <div className="p-8 text-center text-muted-foreground">Contest not found</div>;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-8">
      <Link to={`/contest/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to contest
      </Link>

      <h1 className="font-heading text-2xl font-bold mb-1">{contest.title}</h1>
      <p className="text-sm text-muted-foreground mb-6">Your workspace</p>

      <div className="glass-card rounded-xl p-4 mb-3 flex items-center justify-between animate-fade-in">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <span className="text-sm text-muted-foreground">Time remaining</span>
        </div>
        <CountdownTimer deadline={contest.deadline} className="font-heading font-bold text-primary" />
      </div>

      {contest.drive_link && (
        <a href={contest.drive_link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between glass-card rounded-xl p-4 mb-3 hover:shadow-glass-lg transition-shadow">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Source files</span>
          </div>
          <span className="text-xs text-primary">Drive →</span>
        </a>
      )}

      <div className="glass-card rounded-3xl bg-gradient-to-br from-primary/10 to-accent/5 p-5 mb-3 animate-fade-in">
        <FileVideo className="w-7 h-7 text-primary mb-2" />
        <h2 className="font-heading font-semibold mb-1">Submit your work</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your completed video. The brand reviews it right here in the app — no Drive links needed.
        </p>
        <Button onClick={() => navigate(`/contest/${id}/submit`)} className="w-full" size="lg">
          <Upload className="w-4 h-4" /> Submit work
        </Button>
      </div>

      {versions.length > 0 && (
        <div className="glass-card rounded-2xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Submitted versions</p>
          </div>
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between border border-border rounded-xl p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{v.title || `Version ${v.version || '?'}`}</p>
                  <p className="text-xs text-muted-foreground">
                    v{v.version || '?'}{v.submitted_at ? ` · ${new Date(v.submitted_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground shrink-0">
                  {STATUS_LABEL[v.status] || v.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}