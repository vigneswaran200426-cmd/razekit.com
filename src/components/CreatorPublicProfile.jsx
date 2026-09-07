import { X, Trophy, Star, Calendar, Award } from 'lucide-react';

export default function CreatorPublicProfile({ creator, onClose }) {
  if (!creator) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-card border border-border rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="flex flex-col items-center text-center mb-5 mt-2">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center mb-3">
            <span className="font-heading text-2xl font-bold text-primary">{creator.name[0]}</span>
          </div>
          <p className="font-heading text-lg font-bold">{creator.name}</p>
          {creator.username && <p className="text-xs text-primary">@{creator.username}</p>}
          <p className="text-xs text-muted-foreground">Level {creator.level}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Career Score" value={(creator.displayScore || creator.score || 0).toLocaleString('en-IN')} icon={Trophy} />
          <StatBox label="Wins" value={creator.wins} icon={Award} />
          <StatBox label="Reviews" value={`${creator.reviews}★`} icon={Star} />
          <StatBox label="Member Since" value={creator.memberSince} icon={Calendar} />
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3 text-center">
      <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}