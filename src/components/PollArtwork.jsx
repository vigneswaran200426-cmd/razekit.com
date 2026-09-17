// Generated cover art for a poll that has no banner image.
//
// The problem: the three upcoming polls have `banner_url = null`, there is no
// image pipeline wired and no licensed imagery, so the media well rendered as a
// blank hatched box — which reads as a broken image rather than a design.
//
// The solution here is drawn by the browser: layered CSS gradients, one static
// inline SVG per theme, a tiled SVG-filter grain, and at most two composited
// (transform / opacity only) animations per card. Nothing is fetched, so there
// is no loading state and no layout shift.
//
// What this file refuses to do:
//   - It draws NO real logo, wordmark, lettering, character, UI or trade dress,
//     and nothing that could imply a game or AI company sponsored, endorsed or
//     licensed a RazeKit poll. Every shape below is original abstract geometry:
//     a skyline of plain rectangles, plain ellipses, two plain arcs.
//   - It renders NO text and carries NO data. It is aria-hidden decoration; the
//     title, question, counts and disclosure beside it are the real content and
//     the only thing a screen reader gets. Art must never be mistaken for a
//     measurement, so there is nothing here to mistake.
//   - It never wins over a real image. `PollBanners` renders this only when
//     there is no usable `banner_url`.
import { useEffect, useId } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';

/* ── Motion ────────────────────────────────────────────────────────────────
   Keyframes are global by nature, so one shared block is injected once rather
   than one per card. Only `transform` and `opacity` are animated: those stay
   on the compositor, so three banners drifting on the home page cost the same
   as none while the page is being scrolled.

   Reduced motion is handled twice on purpose. index.css already neutralises
   every animation under `prefers-reduced-motion`, which is the guarantee; the
   `still` flag below additionally stops us attaching the animation at all, so
   a reader who asked for stillness also pays nothing for it. */
const STYLE_ID = 'rk-poll-art-motion';
const MOTION_CSS = `
@keyframes rk-art-streak{from{transform:translate3d(-120%,0,0)}to{transform:translate3d(420%,0,0)}}
@keyframes rk-art-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes rk-art-breathe{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes rk-art-sway{0%,100%{transform:translate3d(-7px,0,0)}50%{transform:translate3d(7px,0,0)}}
`;

let injected = false;

function useArtMotionStyles() {
  useEffect(() => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = MOTION_CSS;
    document.head.appendChild(el);
  }, []);
}

/* ── Grain ─────────────────────────────────────────────────────────────────
   feTurbulence is the only thing here that would be expensive live, because a
   filter re-runs over the whole filtered region. So it is run once, off the
   page, inside a 140px data-URI tile the browser rasterises a single time and
   then repeats. `stitchTiles` makes the repeat seamless. Cost at paint time is
   one tiled bitmap, not three filter regions. */
const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>"
  + "<filter id='n'>"
  + "<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>"
  + "<feColorMatrix type='saturate' values='0'/>"
  + '</filter>'
  + "<rect width='140' height='140' filter='url(#n)'/>"
  + '</svg>';

const GRAIN = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`,
  backgroundRepeat: 'repeat',
  backgroundSize: '140px 140px',
  // Overlay keeps the blacks black and only lifts the mid-tones, which is what
  // separates film grain from a grey film over the whole banner.
  mixBlendMode: 'overlay',
  opacity: 0.22,
};

// Pulls the corners down so the eye lands on the middle of the card and the
// white "Upcoming" pill keeps its contrast in the top-left.
const VIGNETTE = {
  background:
    'radial-gradient(118% 96% at 50% 38%, rgba(2,6,18,0) 42%, rgba(2,6,18,0.34) 74%, rgba(2,6,18,0.62) 100%)',
};

function Layer({ style, className }) {
  return <div className={cn('absolute inset-0', className)} style={style} />;
}

const svgProps = {
  viewBox: '0 0 640 360',
  // The well is 16/9 and so is the viewBox, so "slice" never actually crops —
  // it only guarantees full bleed if the well's ratio ever changes.
  preserveAspectRatio: 'xMidYMid slice',
  className: 'absolute inset-0 h-full w-full',
};

/* ── A. nightcity — the open-world poll ────────────────────────────────────
   Deep navy to electric blue, a glow sitting low behind the roofline, and two
   light trails crossing the foreground so the frame reads as a city at night
   rather than a gradient. The skyline is fifteen plain rectangles of invented
   proportions: it is a silhouette of nowhere. */
const TOWERS = [
  [0, 44, 105], [48, 26, 66], [78, 38, 137], [120, 22, 83], [146, 54, 171],
  [204, 30, 110], [238, 42, 73], [284, 26, 142], [314, 60, 188], [378, 24, 90],
  [406, 46, 122], [456, 30, 71], [490, 52, 154], [546, 26, 95], [576, 64, 117],
];

const WINDOWS = [
  [10, 300], [22, 318], [33, 288], [86, 270], [97, 300], [104, 252],
  [154, 238], [158, 208], [168, 266], [181, 300], [186, 242], [212, 290],
  [247, 318], [292, 262], [301, 290], [324, 196], [324, 222], [339, 250],
  [351, 286], [333, 306], [360, 206], [414, 276], [429, 304], [498, 222],
  [498, 250], [513, 282], [525, 310], [586, 280], [601, 300], [613, 272],
];

function NightCity({ uid, still }) {
  // A light trail crossing the foreground. Width is fixed at a third of the
  // card so one keyframe can carry both of them off the right edge.
  const streak = (top, thickness, colour, css) => (
    <div
      className="absolute left-0 w-1/3"
      style={{
        top,
        height: thickness,
        background: `linear-gradient(90deg, transparent, ${colour}, transparent)`,
        ...css,
      }}
    />
  );
  return (
    <>
      <Layer style={{ background: 'linear-gradient(178deg,#02060F 0%,#050E24 34%,#0A1C46 66%,#10306E 100%)' }} />
      <Layer style={{ background: 'radial-gradient(68% 44% at 18% 6%, rgba(70,124,224,0.18) 0%, rgba(0,0,0,0) 70%)' }} />
      <Layer style={{ background: 'radial-gradient(112% 64% at 50% 82%, rgba(52,148,255,0.62) 0%, rgba(18,72,190,0.26) 38%, rgba(0,0,0,0) 72%)' }} />
      <Layer style={{ background: 'radial-gradient(52% 44% at 79% 88%, rgba(6,182,212,0.30) 0%, rgba(0,0,0,0) 70%)' }} />

      <svg {...svgProps} role="presentation">
        <defs>
          <linearGradient id={`${uid}-t`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0C2050" />
            <stop offset="100%" stopColor="#01050E" />
          </linearGradient>
        </defs>
        {/* The same rooflines squashed, offset and dimmed read as a second row
            of towers further back. Depth for fifteen extra rects. */}
        <g fill="#0A1A3E" opacity="0.6" transform="translate(-27 136.8) scale(1 0.62)">
          {TOWERS.map(([x, w, h]) => <rect key={x} x={x} y={360 - h} width={w} height={h} />)}
        </g>
        <g fill={`url(#${uid}-t)`}>
          {TOWERS.map(([x, w, h]) => <rect key={x} x={x} y={360 - h} width={w} height={h} />)}
        </g>
        <g fill="#9AD8FF" opacity="0.5">
          {WINDOWS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="2.5" height="4" />)}
        </g>
      </svg>

      {streak('80%', '1px', 'rgba(186,228,255,0.9)',
        still ? { transform: 'translate3d(62%,0,0)' } : { animation: 'rk-art-streak 11s linear infinite' })}
      {streak('88%', '2px', 'rgba(120,196,255,0.65)',
        still ? { transform: 'translate3d(196%,0,0)' } : { animation: 'rk-art-streak 17s linear -6s infinite' })}
    </>
  );
}

/* ── B. orbital — the AI-era poll ──────────────────────────────────────────
   Violet to indigo with a luminous core, three tilted orbits and a handful of
   nodes wired together. Node coordinates are stated in the orbit group's own
   rotated space, so each one sits exactly on its ellipse. */
const NODES = [
  [114.9, 33.4], [-129.9, -26], [-89.6, 68.9], [136.3, -58.2], [-257.5, -34.9], [248.3, 43.1],
];

const CHORDS = [
  [0, 2], [1, 3], [3, 5], [2, 4],
];

function Orbital({ uid, still }) {
  return (
    <>
      <Layer style={{ background: 'linear-gradient(158deg,#080518 0%,#190F41 42%,#241A63 70%,#0D0929 100%)' }} />
      {/* Slow sweep. Inset past the edges so a rotating rectangle never shows a
          corner; the parent clips whatever escapes. */}
      <div
        className="absolute -inset-1/4"
        style={{
          background: 'conic-gradient(from 0deg, rgba(0,0,0,0) 0 58%, rgba(167,139,250,0.20) 76%, rgba(0,0,0,0) 92%)',
          ...(still ? null : { animation: 'rk-art-spin 44s linear infinite' }),
        }}
      />
      <Layer
        style={{
          background: 'radial-gradient(42% 62% at 50% 50%, rgba(221,214,254,0.55) 0%, rgba(124,58,237,0.32) 32%, rgba(0,0,0,0) 68%)',
          ...(still ? null : { animation: 'rk-art-breathe 7s ease-in-out infinite' }),
        }}
      />

      <svg {...svgProps} role="presentation">
        <defs>
          <linearGradient id={`${uid}-o`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#818CF8" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#4C1D95" stopOpacity="0.08" />
          </linearGradient>
          <radialGradient id={`${uid}-c`}>
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="34%" stopColor="#DDD6FE" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform="translate(320 180) rotate(-18)" fill="none" stroke={`url(#${uid}-o)`} strokeWidth="1">
          <ellipse rx="150" ry="52" />
          <ellipse rx="212" ry="76" />
          <ellipse rx="274" ry="102" />
          <g stroke="#A78BFA" strokeOpacity="0.26" strokeWidth="0.75">
            {CHORDS.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
            ))}
          </g>
          <g fill="#EDE9FE" stroke="none">
            {NODES.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.75" />)}
          </g>
        </g>
        <circle cx="320" cy="180" r="94" fill={`url(#${uid}-c)`} />
        <circle cx="320" cy="180" r="6.5" fill="#FFFFFF" opacity="0.92" />
      </svg>
    </>
  );
}

/* ── C. collab — the creator-and-agent poll ────────────────────────────────
   A cool steel base with one warm light in it, and two forms leaning into each
   other: the warm arc is drawn unbroken, the cool one is segmented. They stop
   short of touching and the light collects in the gap, because the poll is
   about working alongside the thing, not being replaced by it. */
function Collab({ uid, still }) {
  return (
    <>
      <Layer style={{ background: 'linear-gradient(156deg,#03111A 0%,#07222E 44%,#0A3040 74%,#04141D 100%)' }} />
      <Layer
        style={{
          background: 'radial-gradient(56% 80% at 24% 62%, rgba(255,150,60,0.46) 0%, rgba(245,158,11,0.17) 40%, rgba(0,0,0,0) 72%)',
          ...(still ? null : { animation: 'rk-art-sway 13s ease-in-out infinite' }),
        }}
      />
      <Layer style={{ background: 'radial-gradient(52% 74% at 77% 40%, rgba(56,189,248,0.32) 0%, rgba(0,0,0,0) 70%)' }} />

      <svg {...svgProps} role="presentation">
        <defs>
          <linearGradient id={`${uid}-w`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD9A0" stopOpacity="0.14" />
            <stop offset="55%" stopColor="#FFA24D" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FF7A18" stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id={`${uid}-k`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#38BDF8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id={`${uid}-s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="50%" stopColor="#FFF1DC" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fill="none" strokeLinecap="round">
          <path d="M286 34 C 160 80, 130 212, 258 326" stroke={`url(#${uid}-w)`} strokeWidth="2.5" />
          <path d="M296 70 C 206 106, 186 210, 282 296" stroke={`url(#${uid}-w)`} strokeWidth="1.25" strokeOpacity="0.5" />
          <path d="M354 32 C 480 78, 510 210, 382 324" stroke={`url(#${uid}-k)`} strokeWidth="2.5" />
          <path d="M344 68 C 434 104, 454 210, 358 294" stroke={`url(#${uid}-k)`} strokeWidth="1.25" strokeOpacity="0.5" strokeDasharray="10 7" />
        </g>
        {/* The gap where they meet. Points on the seam rather than bars across
            it — bars crossing this line drew an unintended symbol. */}
        <rect x="319.25" y="88" width="1.5" height="184" fill={`url(#${uid}-s)`} />
        <g fill="#FFE8CC" fillOpacity="0.5">
          <circle cx="320" cy="132" r="1.9" />
          <circle cx="320" cy="180" r="2.4" />
          <circle cx="320" cy="228" r="1.9" />
        </g>
      </svg>

      <Layer
        style={{
          background: 'radial-gradient(16% 44% at 50% 50%, rgba(255,236,206,0.34) 0%, rgba(0,0,0,0) 72%)',
          ...(still ? null : { animation: 'rk-art-breathe 6s ease-in-out infinite' }),
        }}
      />
    </>
  );
}

/* ── D. signal — anything else ─────────────────────────────────────────────
   A poll this file has never heard of gets RazeKit blue and the diagonal
   hairlines the rest of the app uses for an empty media well. Deliberately
   still and deliberately generic: inventing a mood for a subject we do not
   know would be the art telling a story the poll never told. */
function Signal({ uid }) {
  return (
    <>
      <Layer style={{ background: 'linear-gradient(150deg,#061026 0%,#0B1E42 56%,#091530 100%)' }} />
      <Layer style={{ background: 'radial-gradient(76% 64% at 50% 20%, rgba(26,123,248,0.34) 0%, rgba(0,0,0,0) 70%)' }} />
      <Layer style={{ background: 'radial-gradient(90% 46% at 50% 108%, rgba(11,68,199,0.42) 0%, rgba(0,0,0,0) 72%)' }} />
      <svg {...svgProps} role="presentation">
        <defs>
          <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9CC6FF" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#1A7BF8" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <g stroke={`url(#${uid}-g)`} strokeWidth="1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <line key={i} x1={-130 + i * 78} y1="360" x2={110 + i * 78} y2="0" />
          ))}
        </g>
      </svg>
    </>
  );
}

/* ── Which treatment ───────────────────────────────────────────────────────
   Slug first because it is the stable key the server votes on; theme second so
   a renamed slug still lands on the art it was drawn for; `art_key` first of
   all so an editor can pick one later without a deploy. Nothing random: the
   same poll must draw the same card on every render, or the home page would
   reshuffle its own artwork on a re-render. */
const TREATMENTS = { nightcity: NightCity, orbital: Orbital, collab: Collab, signal: Signal };

const BY_SLUG = {
  'gta-6': 'nightcity',
  'gpt-6-astra': 'orbital',
  higgsfield: 'signal',
  // Superseded by higgsfield as the third promotional poll, and archived rather
  // than deleted because real people voted in it. Kept here so an archived poll
  // surfaced in admin still draws the art it was written for.
  'ai-creator-agents': 'collab',
};

const BY_THEME = {
  'gta 6': 'nightcity',
  'gpt-6 astra': 'orbital',
  higgsfield: 'signal',
  'ai creator agents': 'collab',
};

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function artKeyFor(poll) {
  const explicit = norm(poll?.art_key).replace(/ /g, '');
  if (TREATMENTS[explicit]) return explicit;
  return BY_SLUG[norm(poll?.slug)] || BY_THEME[norm(poll?.theme)] || 'signal';
}

export default function PollArtwork({ poll, className }) {
  const reduce = useReducedMotion();
  // Three banners share the page, so gradient and filter ids have to be unique
  // per card or the second card would paint with the first card's gradients.
  // Colons are legal in a fragment reference but ugly to debug, so they go.
  const uid = `pa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useArtMotionStyles();

  const Art = TREATMENTS[artKeyFor(poll)] || Signal;

  // `isolate` keeps the grain's overlay blend inside this box. Without a
  // stacking context of its own the blend reaches whatever happens to sit
  // behind the card, which changes the grain when the page background does.
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none relative isolate h-full w-full select-none overflow-hidden', className)}
      style={{ backgroundColor: '#050B1A' }}
    >
      <Art uid={uid} still={!!reduce} />
      <Layer style={VIGNETTE} />
      <Layer style={GRAIN} />
    </div>
  );
}
