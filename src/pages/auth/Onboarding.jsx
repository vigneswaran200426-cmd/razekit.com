import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Briefcase, Check } from 'lucide-react';
import { auth } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { RazekitLogo } from '@/components/Brand';
import { cn } from '@/lib/cn';

const ROLES = [
  { key: 'creator', title: 'I’m a Creator', desc: 'Compete in contests, submit creative work, win prizes and build a public portfolio.', icon: Video },
  { key: 'client', title: 'I’m a Brand', desc: 'Launch prize-funded contests, brief real work, review entries and pick winners.', icon: Briefcase },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [choice, setChoice] = useState(user?.user_role && user.user_role !== 'visitor' ? user.user_role : null);
  const [loading, setLoading] = useState(false);

  const finish = async () => {
    if (!choice) return;
    setLoading(true);
    try { await auth.updateMe({ user_role: choice, onboarding_completed: true }); await refresh(); navigate('/dashboard', { replace: true }); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-bg px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="flex justify-center mb-8"><RazekitLogo mark={38} word={26} /></div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink text-center">How will you use RazeKit?</h1>
        <p className="mt-2 text-center text-muted">You can explore both sides later — this just sets up your home.</p>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          {ROLES.map((r) => {
            const active = choice === r.key;
            return (
              <button key={r.key} onClick={() => setChoice(r.key)}
                className={cn('relative text-left rounded-lg border-2 bg-surface p-5 transition-all ease-brand', active ? 'border-primary shadow-glow' : 'border-line hover:border-line-strong')}>
                {active && <span className="absolute top-3 right-3 grid place-items-center w-5 h-5 rounded-full bg-primary text-white"><Check className="w-3 h-3" /></span>}
                <span className={cn('grid h-11 w-11 place-items-center rounded-md', active ? 'bg-primary text-white' : 'bg-surface-2 text-primary')}><r.icon className="w-5 h-5" /></span>
                <h3 className="mt-3 font-display text-lg font-bold text-ink">{r.title}</h3>
                <p className="mt-1 text-sm text-muted leading-relaxed">{r.desc}</p>
              </button>
            );
          })}
        </div>
        <Button size="lg" className="w-full mt-6" disabled={!choice} loading={loading} onClick={finish}>Continue</Button>
      </div>
    </div>
  );
}
