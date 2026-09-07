import { Link } from 'react-router-dom';
import { X, Trophy, ExternalLink, User, Calendar, Building2, Play } from 'lucide-react';
import { formatPrize } from '@/lib/utils';

// Winner detail — glass modal opened from a WinnerCard. Read-only, links into real routes.
export default function WinnerDetailModal({ item, onClose }) {
  if (!item) return null;
  const { contest, winner, client } = item;
  const name = winner?.display_name || winner?.username || `Creator #${contest.winner_user_id?.slice(-4)?.toUpperCase()}`;
  const clientName = client?.company_name || client?.display_name || client?.username || 'Brand';
  const date = contest.winner_selected_at ? new Date(contest.winner_selected_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const brief = (contest.short_description || contest.brief || contest.description || '').replace(/<[^>]+>/g, ' ').trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-border max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-52 bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10">
          {contest.cover_image_url && <img src={contest.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/85 flex items-center justify-center"><X className="w-5 h-5" /></button>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-success/90 text-white font-semibold"><Trophy className="w-3.5 h-3.5" /> Verified Winner</span>
        </div>
        <div className="p-5 md:p-6 space-y-4">
          <div>
            <span className="text-[11px] text-primary font-medium">{contest.category}</span>
            <h2 className="font-heading text-2xl font-bold leading-tight">{contest.title}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Meta icon={User} label="Winner" value={name} />
            <Meta icon={Building2} label="Brand" value={clientName} />
            <Meta icon={Trophy} label="Prize" value={formatPrize(contest.prize_amount, contest.currency)} />
            <Meta icon={Calendar} label="Won" value={date || '—'} />
          </div>
          {brief && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Contest brief</p>
              <p className="text-sm text-foreground/90 line-clamp-6">{brief}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link to={`/contest/${contest.id}/results`} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold"><Play className="w-4 h-4" /> View winning entry</Link>
            <Link to={`/contest/${contest.id}`} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-border text-sm font-medium"><ExternalLink className="w-4 h-4" /> View contest</Link>
            {winner?.username && <Link to={`/u/${winner.username}`} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-border text-sm font-medium"><User className="w-4 h-4" /> View creator</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-3">
      <Icon className="w-4 h-4 text-primary mb-1" />
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold truncate">{value}</p>
    </div>
  );
}