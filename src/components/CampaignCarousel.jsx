// Dashboard campaign carousel (spec 25) — a featured RazeKit campaign module,
// not an ad-network widget.
//
// Deep-links only resolve to a REAL contest record. Where no such contest
// exists, the CTA routes to Discover instead of fabricating a destination.
// Slides carry no affiliation claim: they are RazeKit-run branding briefs.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { entities } from '@/lib/api';
import { money } from '@/lib/format';

const EASE = [0.22, 1, 0.36, 1];

const SLIDES = [
  {
    id: 'gta6',
    headline: 'GTA 6 Branding Video Makers Contest',
    copy: 'Create a standout branding video concept and compete for a ₹3 lakh prize.',
    prize: 300000,
    cta: 'Enter contest',
    // Cinematic gaming energy: premium dark/blue tonal gradient.
    bg: 'linear-gradient(120deg,#07142e 0%,#0d2452 42%,#1746a2 100%)',
    glow: 'radial-gradient(60% 90% at 78% 20%, rgba(49,211,255,0.30), transparent 70%)',
  },
  {
    id: 'gpt6astra',
    headline: 'GPT 6 Astra Branding Video Makers Contest',
    copy: 'Create a bold brand video concept and compete for a ₹1 lakh prize.',
    prize: 100000,
    cta: 'Explore contest',
    // Futuristic AI aesthetic: cool blue-violet glow, elegant light accents.
    bg: 'linear-gradient(120deg,#0a0f2c 0%,#221a5e 48%,#4426b8 100%)',
    glow: 'radial-gradient(55% 85% at 22% 18%, rgba(148,120,255,0.34), transparent 70%)',
  },
  {
    id: 'razekit',
    headline: 'RazeKit Branding Video Makers Contest',
    copy: 'Show us how you would bring the RazeKit brand to life.',
    prize: 50000,
    cta: 'Create for RazeKit',
    // RazeKit blue/white premium treatment.
    bg: 'linear-gradient(120deg,#0d1b3a 0%,#1055c8 55%,#2f7bf5 100%)',
    glow: 'radial-gradient(60% 90% at 82% 78%, rgba(255,255,255,0.24), transparent 70%)',
  },
];

export default function CampaignCarousel() {
  const [i, setI] = useState(0);
  const [matches, setMatches] = useState({});
  const reduce = useReducedMotion();

  // Resolve each slide to a real contest, if one exists.
  useEffect(() => {
    entities.Contest.filter({ status: 'open' }, '-created_date', 200)
      .then((rows) => {
        const found = {};
        for (const s of SLIDES) {
          const key = s.headline.toLowerCase().split(' ')[0];
          const hit = (rows || []).find((c) => String(c.title || '').toLowerCase().includes(key));
          if (hit) found[s.id] = hit.id;
        }
        setMatches(found);
      })
      .catch(() => {});
  }, []);

  // Calm auto-rotation, disabled entirely under reduced motion (spec 25).
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 7000);
    return () => clearInterval(t);
  }, [reduce]);

  const slide = SLIDES[i];
  const to = useMemo(() => (matches[slide.id] ? `/contest/${matches[slide.id]}` : '/discover'), [matches, slide.id]);
  const go = (n) => setI((n + SLIDES.length) % SLIDES.length);

  return (
    <section aria-label="Featured RazeKit campaigns" aria-roledescription="carousel" className="relative overflow-hidden rounded-xl border border-line">
      <div className="relative h-[210px] sm:h-[220px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="absolute inset-0"
            style={{ background: slide.bg }}
          >
            <div className="absolute inset-0" style={{ background: slide.glow }} aria-hidden="true" />
            <div className="relative h-full flex flex-col justify-center gap-2 px-5 sm:px-8 max-w-2xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">Featured campaign</p>
              <h2 className="font-display text-xl sm:text-[28px] font-extrabold leading-tight tracking-tight text-white">
                {slide.headline}
              </h2>
              <p className="text-[13px] leading-snug text-white/75 max-w-lg">{slide.copy}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <span className="font-display text-lg font-extrabold text-white nums">{money(slide.prize, 'INR')}</span>
                <Link
                  to={to}
                  className="inline-flex items-center rounded-md bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#0d1b3a] transition-transform hover:scale-[1.02] active:scale-[0.99]"
                >
                  {slide.cta}
                </Link>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <button onClick={() => go(i - 1)} aria-label="Previous campaign"
          className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded-full bg-black/25 text-white hover:bg-black/40 transition-colors">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <button onClick={() => go(i + 1)} aria-label="Next campaign"
          className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded-full bg-black/25 text-white hover:bg-black/40 transition-colors">
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {SLIDES.map((s, n) => (
            <button key={s.id} onClick={() => setI(n)} aria-label={`Show campaign ${n + 1}`} aria-current={n === i}
              className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/70'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
