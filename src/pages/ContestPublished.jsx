import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Trophy, Clock, IndianRupee } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import CountdownTimer from '@/components/CountdownTimer';
import AlertState from '@/components/alerts/AlertState';

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium nums">{value}</span>
    </div>
  );
}

export default function ContestPublished() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);

  useEffect(() => {
    base44.entities.Contest.get(id).then(setContest).catch(() => {});
  }, [id]);

  if (!contest) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;

  const reservedFunds = (contest.prize_amount || 0) + (contest.platform_fee || 0);

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in">
        <AlertState
          type="success"
          shape="blob"
          title="Contest published"
          description="Your contest is live. Creators can join now."
        />

        <div className="surface-2 rounded-2xl p-5 space-y-3 text-left elev-1">
          <Row label="Contest ID" value={contest.contest_id} />
          <Row label="Prize" value={`₹${contest.prize_amount?.toLocaleString('en-IN')}`} />
          <Row label="Status" value="Open" />
          <Row label="Reserved in wallet" value={`₹${reservedFunds.toLocaleString('en-IN')}`} />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Time remaining</span>
            <CountdownTimer deadline={contest.deadline} className="text-primary font-medium nums" />
          </div>
        </div>

        <div className="space-y-3">
          <Button asChild size="lg" className="w-full rounded-full press"><Link to={`/contest/${contest.id}`}>View contest</Link></Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" asChild className="rounded-full press"><Link to="/my-contests">Manage</Link></Button>
            <Button variant="outline" asChild className="rounded-full press"><Link to="/create-contest">Create another</Link></Button>
          </div>
          <Button variant="ghost" asChild className="w-full rounded-full press"><Link to="/">Home</Link></Button>
        </div>
      </div>
    </div>
  );
}