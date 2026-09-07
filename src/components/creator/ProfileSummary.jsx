import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

// Compact profile preview (§17) — real profile data, no XP/levels ever.
export default function ProfileSummary({ profile, user, rating, wins }) {
  const name = profile?.display_name || user?.full_name || user?.email?.split('@')[0] || 'Member';
  const initials = (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const skills = (profile?.skills || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-3">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-razekit-gradient text-white text-sm font-bold flex items-center justify-center shrink-0">{initials}</div>
        )}
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm truncate">{name}</p>
          {profile?.username && <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>}
        </div>
      </div>
      {profile?.bio && <p className="text-xs text-muted-foreground line-clamp-2 mt-2.5">{profile.bio}</p>}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {skills.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">{s}</span>)}
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
        {rating && <span className="inline-flex items-center gap-1 font-semibold text-foreground"><Star className="w-3.5 h-3.5 text-[#D78C05] fill-[#D78C05]" />{rating}</span>}
        <span>{wins} win{wins === 1 ? '' : 's'}</span>
        <Link to="/profile" className="ml-auto text-primary font-semibold hover:underline">View Profile</Link>
      </div>
    </GlassCard>
  );
}