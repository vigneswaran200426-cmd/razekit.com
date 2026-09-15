// Per-route document metadata.
//
// RazeKit is a client-rendered SPA served as a static site, so index.html is the
// only HTML any crawler receives. Googlebot does execute JavaScript and will
// pick up what this writes; most other crawlers (X, LinkedIn, WhatsApp, Slack)
// do NOT, and will only ever see index.html's defaults.
//
// That asymmetry is why the defaults in index.html are written to be correct
// and complete on their own, and why this component only ever NARROWS them for
// a specific route. A route that sets nothing still shares correctly.
//
// It writes tags directly rather than pulling in react-helmet: the whole job is
// a dozen DOM attributes, and a head-management library is a dependency, a
// provider, and a render-order gotcha in exchange for nothing here.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ORIGIN = 'https://razekit.com';
const DEFAULT_TITLE = 'RazeKit — Creator Contests & Brand Campaigns';
const DEFAULT_DESC =
  'RazeKit is a contest marketplace where brands fund creative briefs, creators compete on them, and the winner is chosen on measured performance — then paid in public.';

/** Routes with no public content. Indexing them puts empty shells in results. */
const PRIVATE_PREFIXES = [
  '/dashboard', '/tracker', '/work', '/balance', '/wallet', '/profile', '/settings',
  '/notifications', '/onboarding', '/create-contest', '/track-record', '/admin',
  '/login', '/register',
];

const PRIVATE_CONTEST_SUFFIXES = ['/submit', '/review', '/fund', '/verify', '/report', '/handover'];

export function isIndexablePath(pathname) {
  const p = String(pathname || '/');
  if (PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(x + '/'))) return false;
  if (p.startsWith('/contest/') && PRIVATE_CONTEST_SUFFIXES.some((s) => p.endsWith(s))) return false;
  return true;
}

function upsert(selector, create, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
  return el;
}

const meta = (name, content) =>
  upsert(`meta[name="${name}"]`, () => {
    const el = document.createElement('meta');
    el.setAttribute('name', name);
    return el;
  }, 'content', content);

const prop = (property, content) =>
  upsert(`meta[property="${property}"]`, () => {
    const el = document.createElement('meta');
    el.setAttribute('property', property);
    return el;
  }, 'content', content);

const canonical = (href) =>
  upsert('link[rel="canonical"]', () => {
    const el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    return el;
  }, 'href', href);

/**
 * @param title   page title WITHOUT the brand suffix; omitted falls back to the default
 * @param description  page description; omitted falls back to the default
 * @param image   absolute URL of a page-specific preview image
 * @param noindex force this page out of the index regardless of its path
 */
export default function Seo({ title, description, image, noindex }) {
  const { pathname } = useLocation();

  useEffect(() => {
    // "About RazeKit" must not become "About RazeKit | RazeKit". A title that
    // already carries the brand is left alone.
    const full = !title ? DEFAULT_TITLE
      : /razekit/i.test(title) ? title
      : `${title} | RazeKit`;
    const desc = description || DEFAULT_DESC;
    const img = image || `${ORIGIN}/og.png`;

    // Canonical never carries a query string or a hash: ?ref= and ?utm_ values
    // would otherwise split one page's ranking signal across dozens of URLs.
    const url = ORIGIN + (pathname === '/' ? '/' : pathname.replace(/\/+$/, ''));

    document.title = full;
    meta('description', desc);
    canonical(url);
    meta('robots', (noindex || !isIndexablePath(pathname))
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1');

    prop('og:title', full);
    prop('og:description', desc);
    prop('og:url', url);
    prop('og:image', img);
    meta('twitter:title', full);
    meta('twitter:description', desc);
    meta('twitter:image', img);
  }, [pathname, title, description, image, noindex]);

  return null;
}

/* ── RouteSeo ────────────────────────────────────────────────────────────────
   One place that names every public route, so a page does not have to remember
   to describe itself. Titles are written for a search result, not for the tab:
   they say what the page IS and who it is for, because that line is often the
   only thing a person reads before deciding whether to click.

   A route absent from this map still gets the correct defaults and the correct
   index/noindex decision from the path — so a new page is never accidentally
   published with another page's title. */
const ROUTE_SEO = {
  '/': {
    title: null, // the homepage keeps the full brand title
    description: DEFAULT_DESC,
  },
  '/discover': {
    title: 'Discover Creator Contests',
    description: 'Open contests with funded prizes, real briefs and clear deadlines. Find a campaign that fits what you make, and compete on measured performance.',
  },
  '/explore': {
    title: 'Explore Creators & Campaigns',
    description: 'Browse creators, winning work and brand campaigns on RazeKit — the work that won, and the performance behind it.',
  },
  '/winners': {
    title: 'Winners — Winning Creator Work',
    description: 'Every RazeKit winner, the work that won, and the scores it won on. Video engagement and brand traffic, shown in public.',
  },
  '/about': {
    title: 'About RazeKit',
    description: 'What RazeKit is, who it is for, how contests work, how performance is measured and how winners are chosen and paid.',
  },
  '/contact': {
    title: 'Contact & Support',
    description: 'Reach RazeKit support by email, phone or WhatsApp, or raise a ticket about an account, a contest, a submission or a payment.',
  },
  '/help': {
    title: 'Help Centre & Guide',
    description: 'How to run a contest as a brand and how to compete as a creator: briefs, submissions, scoring, winners, handover and payouts.',
  },
  '/terms': {
    title: 'Terms of Service',
    description: 'The terms that govern using RazeKit, entering contests, funding prizes and receiving payouts.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description: 'What data RazeKit collects, why it is collected, how it is used and what choices you have.',
  },
};

/** Drop once inside the router; it re-runs on every navigation. */
export function RouteSeo() {
  const { pathname } = useLocation();
  const key = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const entry = ROUTE_SEO[key];
  return <Seo title={entry?.title || undefined} description={entry?.description || undefined} />;
}
