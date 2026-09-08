import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Trophy, Sparkles, ShieldCheck, Rocket } from 'lucide-react';
import { entities } from '@/lib/api';
import { RazekitLogo } from '@/components/Brand';
import { Button } from '@/components/ui';
import ContestCard from '@/components/ContestCard';

const STEPS = [
  { icon: Rocket, title: 'Brands launch', desc: 'A brand funds a prize and briefs the creative work they need.' },
  { icon: Sparkles, title: 'Creators compete', desc: 'Creators submit real work — the best entries rise to the top.' },
  { icon: Trophy, title: 'Winners get paid', desc: 'The brand picks winners; payouts and handover happen in public.' },
];

export default function Landing() {
  const [live, setLive] = useState([]);
  useEffect(() => { entities.Contest.filter({ status: 'open' }, '-created_date', 6).then((l) => setLive(l || [])).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl">
        <div className="shell h-16 flex items-center">
          <RazekitLogo mark={34} word={23} />
          <nav className="hidden md:flex items-center gap-1 ml-8 text-sm">
            {['Contests', 'Creators', 'How it works'].map((l) => <a key={l} href="#how" className="px-3 py-2 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors font-medium">{l}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/login" className="px-3.5 py-2 text-sm font-medium text-ink rounded-md hover:bg-surface-2">Log in</Link>
            <Button to="/register" size="md">Get started</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(90% 60% at 80% -10%, rgb(26 123 248 / 0.10), transparent 60%)' }} />
        <div className="shell py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-semibold text-primary">
              <Sparkles className="w-3.5 h-3.5" /> Prize-funded creative contests
            </motion.span>
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="mt-5 font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-ink leading-[1.02]">
              Create.<br />Compete.<br /><span className="text-primary">Win in public.</span>
            </motion.h1>
            <p className="mt-5 text-lg text-muted max-w-md leading-relaxed">RazeKit is the creator contest marketplace — brands brief real work, creators compete on it, and winners get paid.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/register" size="lg">Start competing <ArrowRight className="w-4 h-4" /></Button>
              <Button to="/explore" size="lg" variant="secondary">Browse contests</Button>
            </div>
            <div className="mt-10 flex gap-8">
              {[['Open', 'contests live'], ['Verified', 'creators'], ['Secure', 'payouts']].map(([a, b]) => (
                <div key={b}><p className="font-display text-xl font-extrabold text-ink">{a}</p><p className="text-xs text-muted">{b}</p></div>
              ))}
            </div>
          </div>
          {/* Live strip */}
          <div className="relative">
            <div className="rounded-xl border border-line bg-surface shadow-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-bold text-ink flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live now</p>
                <Link to="/explore" className="text-sm text-primary font-semibold hover:underline">See all</Link>
              </div>
              {live.length ? (
                <div className="grid sm:grid-cols-2 gap-3">{live.slice(0, 4).map((c, i) => <ContestCard key={c.id} contest={c} index={i} />)}</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="rounded-lg border border-line overflow-hidden"><div className="aspect-[16/9] hatch bg-surface-2" /><div className="p-3 space-y-2"><div className="h-3 w-3/4 rounded bg-surface-2" /><div className="h-4 w-1/2 rounded bg-surface-2" /></div></div>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="shell py-16 border-t border-line">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink text-center">How RazeKit works</h2>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-lg border border-line bg-surface p-6">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-primary/10 text-primary"><s.icon className="w-5 h-5" /></span>
              <p className="mt-4 text-xs font-semibold text-muted">STEP {i + 1}</p>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="shell pb-20">
        <div className="rounded-xl p-10 sm:p-14 text-center overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #12306b, #0b1c3f)' }}>
          <ShieldCheck className="w-8 h-8 text-[#4c9bff] mx-auto" />
          <h2 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Your next win starts here.</h2>
          <p className="mt-3 text-white/70 max-w-lg mx-auto">Join creators competing for real prizes, or launch a contest and let the best talent bring your vision to life.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button to="/register" size="lg">Create your account</Button>
            <Button to="/explore" size="lg" variant="secondary" className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/15">Explore contests</Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8"><div className="shell flex items-center justify-between text-sm text-muted"><RazekitLogo mark={26} word={18} /><p>© {new Date().getFullYear()} RazeKit</p></div></footer>
    </div>
  );
}
