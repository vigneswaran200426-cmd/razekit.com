// Dashboard campaign carousel — a featured RazeKit campaign module, not an
// ad-network widget.
//
// Every word and every number on a slide comes from a REAL Contest row. This
// used to carry three hard-coded slides with invented prize figures (a "GTA 6"
// contest at 3 lakh that did not exist), which meant a creator's dashboard
// advertised a prize nobody could win. The gradients below are the only
// hard-coded thing left, because a gradient is presentation; a prize is a claim.
//
// When there is no real campaign to feature, this renders NOTHING. An empty
// dashboard section is honest in a way a fabricated one is not.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { entities } from '@/lib/api';
import { money, dateShort } from '@/lib/format';

const EASE = [0.22, 1, 0.36, 1];

/* Presentation only — cycled by slot, carrying no meaning about the contest. */
const THEMES = [
  {
    bg: 'linear-gradient(120deg,#07142e 0%,#0d2452 42%,#1746a2 100%)',
    glow: 'radial-gradient(60% 90% at 78% 20%, rgba(49,211,255,0.30), transparent 70%)',
  },
  {
    bg: 'linear-gradient(120deg,#0a0f2c 0%,#221a5e 48%,#4426b8 100%)',
    glow: 'radial-gradient(55% 85% at 22% 18%, rgba(148,120,255,0.34), transparent 70%)',
  },
  {
    bg: 'linear-gradient(120deg,#0d1b3a 0%,#1055c8 55%,#2f7bf5 100%)',
    glow: 'radial-gradient(60% 90% at 82% 78%, rgba(255,255,255,0.24), transparent 70%)',
  },
];

export default function CampaignCarousel() {
  const [i, setI] = useState(0);
  const [slides, setSlides] = useState(null);
  const reduce = useReducedMotion();

  // Real open contests, newest first. A contest only reaches 'open' once its
  // prize has actually been funded, so anything featured here is enterable.
  useEffect(() => {
    let alive = true;
    entities.Contest.filter({ status: 'open' }, '-created_date', 12)
      .then((rows) => {
        if (!alive) return;
        setSlides((rows || []).slice(0, 3).map((c, n) => ({
          id: c.id,
          headline: c.title,
          copy: c.short_description || c.description || '',
          prize: Number(c.prize_amount) || null,
          currency: c.currency || 'INR',
          deadline: c.deadline || null,
          ...THEMES[n % THEMES.length],
        })));
      })
      .catch(() => { if (alive) setSlides([]); });
    return () => { alive = false; };
  }, []);

  const count = slides?.length || 0;

  // Calm auto-rotation, disabled entirely under reduced motion.
  useEffect(() => {
    if (reduce || count < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % count), 7000);
    return () => clearInterval(t);
  }, [reduce, count]);

  // Nothing real to feature: render nothing rather than invent a campaign.
  if (!slides || count === 0) return null;

  const slide = slides[Math.min(i, count - 1)];
  const to = `/contest/${slide.id}`;
  const go = (n) => setI((n + count) % count);

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
                {/* A prize we have no figure for is omitted, never shown as 0. */}
                {slide.prize ? (
                  <span className="font-display text-lg font-extrabold text-white nums">
                    {money(slide.prize, slide.currency)}
                  </span>
                ) : null}
                {slide.deadline ? (
                  <span className="text-[12px] text-white/70">Closes {dateShort(slide.deadline)}</span>
                ) : null}
                <Link
                  to={to}
                  className="inline-flex items-center rounded-md bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#0d1b3a] transition-transform hover:scale-[1.02] active:scale-[0.99]"
                >
                  Open contest
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
          {slides.map((s, n) => (
            // The dot is 6px; the BUTTON is 44px. A control you cannot reliably
            // hit on a phone is not a control.
            <button key={s.id} onClick={() => setI(n)} aria-label={`Show campaign ${n + 1}`} aria-current={n === i}
              className="group grid h-11 w-6 place-items-center focus-visible:outline-none">
              <span aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/45 group-hover:bg-white/70'}`} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
