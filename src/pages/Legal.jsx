// Legal.jsx — Terms, Privacy, About and Contact.
//
// Four public documents, one shared reading shell. Everything stated here is
// checked against what the platform actually does:
//   • RAZEKIT_BETA_PAYMENT_SYSTEM.md  (manual funding + ledger, currently PARKED)
//   • server/src/payments/config.ts   (betaNotice(), PAYMENT_MODE)
//
// Payment mode is MAINTENANCE: funding is NOT open while an automated provider
// is connected. Nothing on this page may imply a payment is automatic, instant,
// guaranteed, escrowed or protected. The words "wallet" and "escrow" are never
// used for RazeKit; clauses that genuinely need a lawyer are marked as such
// rather than answered with an invented legal conclusion.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, MessageCircle, ChevronRight, Scale, Quote, ShieldCheck,
  LifeBuoy, ArrowUp, Trophy, Target, Activity, Lock, Eye, FileText,
} from 'lucide-react';
import { fn } from '@/lib/api';
import { cn } from '@/lib/cn';
import { dateShort } from '@/lib/format';
import { Card, Button, Badge, Skeleton } from '@/components/ui';

/* ══ Constants ═══════════════════════════════════════════════════════════ */

const LAST_UPDATED = '2026-09-10';

const CONTACT = {
  phone: '+91 8608911369',
  phoneHref: 'tel:+918608911369',
  email: 'razekitchat@razekit.com',
  emailHref: 'mailto:razekitchat@razekit.com',
  whatsapp: 'https://wa.me/918608911369',
};

/* ══ Small shared pieces ═════════════════════════════════════════════════ */

const prose = 'max-w-[72ch] text-[15px] leading-[1.75] text-muted';

function ReviewNote({ children }) {
  return (
    <aside
      className="my-5 max-w-[72ch] rounded-lg border border-warning/25 bg-warning/[0.06] p-4"
      aria-label="Needs professional legal review"
    >
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-warning">
        <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Needs professional legal review
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink/80">{children}</p>
    </aside>
  );
}

function Verbatim({ children }) {
  return (
    <blockquote className="my-5 max-w-[72ch] border-l-[3px] border-primary bg-primary/[0.05] py-3 pl-4 pr-4 rounded-r-md">
      <Quote className="mb-1.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <p className="text-[15px] leading-[1.7] font-medium text-ink">{children}</p>
    </blockquote>
  );
}

/** A block is a string (paragraph) or one of the shapes below. */
function Block({ b }) {
  if (typeof b === 'string') return <p className={cn(prose, 'mt-3 first:mt-0')}>{b}</p>;
  if (b.list) {
    return (
      <ul className={cn(prose, 'mt-3 space-y-2')}>
        {b.list.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (b.steps) {
    return (
      <ol className={cn(prose, 'mt-3 space-y-2')}>
        {b.steps.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="nums mt-[3px] grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-surface-2 text-[11px] font-bold text-ink">
              {i + 1}
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (b.defs) {
    return (
      <dl className="mt-4 max-w-[72ch] divide-y divide-line rounded-lg border border-line bg-surface">
        {b.defs.map(([term, def], i) => (
          <div key={i} className="px-4 py-3 sm:grid sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-4">
            <dt className="text-[13px] font-bold text-ink">{term}</dt>
            <dd className="mt-1 text-[14px] leading-relaxed text-muted sm:mt-0">{def}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (b.note) return <ReviewNote>{b.note}</ReviewNote>;
  if (b.verbatim) return <Verbatim>{b.verbatim}</Verbatim>;
  return null;
}

/* ══ Contact block (shared, end of every document) ═══════════════════════ */

const CONTACT_METHODS = [
  {
    icon: Phone, label: 'Phone', value: CONTACT.phone, href: CONTACT.phoneHref,
    hint: 'Call the RazeKit support line.',
  },
  {
    icon: Mail, label: 'Email', value: CONTACT.email, href: CONTACT.emailHref,
    hint: 'Best for anything with attachments or references.',
  },
  {
    icon: MessageCircle, label: 'WhatsApp support', value: 'Chat on WhatsApp', href: CONTACT.whatsapp,
    hint: 'Quick questions during the beta.', external: true,
  },
];

function ContactBlock({ heading = 'Contact', intro }) {
  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="contact-block">
      <h2 id="contact-block" className="font-display text-xl font-extrabold tracking-tight text-ink">
        {heading}
      </h2>
      <p className={cn(prose, 'mt-2')}>
        {intro || 'Questions about this document, or anything else on RazeKit — reach the team directly.'}
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CONTACT_METHODS.map((m) => (
          <li key={m.label}>
            <a
              href={m.href}
              {...(m.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="group flex min-h-[64px] items-center gap-3 rounded-lg border border-line bg-surface p-3.5 transition-all duration-200 ease-brand hover:border-primary/50 hover:shadow-md"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2 text-primary">
                <m.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{m.label}</span>
                <span className="block truncate text-[14px] font-bold text-ink">{m.value}</span>
              </span>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted/60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 max-w-[72ch] text-[13px] leading-relaxed text-muted">
        You can also open a support ticket from the{' '}
        <Link to="/help" className="font-semibold text-primary underline underline-offset-2">Help Center</Link>, which
        keeps the conversation attached to your account and your contest. Response times are targets, not guarantees.
      </p>
    </section>
  );
}

/* ══ Document shell: sticky index (desktop) + jump-to (mobile) ═══════════ */

function useNumbered(parts) {
  return useMemo(() => {
    let n = 0;
    const numbered = parts.map((p) => ({
      ...p,
      sections: p.sections.map((s) => ({ ...s, n: ++n })),
    }));
    const flat = numbered.flatMap((p) => p.sections);
    return { numbered, flat };
  }, [parts]);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* older browsers */ }
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

function LegalDoc({ eyebrow, title, description, parts, updated = LAST_UPDATED, contactIntro }) {
  const { numbered, flat } = useNumbered(parts);
  const ids = useMemo(() => flat.map((s) => s.id), [flat]);
  const idKey = ids.join('|');
  const [active, setActive] = useState(ids[0]);
  const [showTop, setShowTop] = useState(false);
  const topRef = useRef(null);

  // Highlight the section currently being read.
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (seen[0]) setActive(seen[0].target.id);
      },
      { rootMargin: '-88px 0px -68% 0px', threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  // Deep links (/terms#payouts) land on the right section, below the app header.
  useEffect(() => {
    const hash = decodeURIComponent(String(window.location.hash || '').replace('#', ''));
    if (hash && ids.includes(hash)) {
      const t = setTimeout(() => scrollToSection(hash), 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      {/* Header */}
      <header ref={topRef}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[30px] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-[40px]">
          {title}
        </h1>
        <p className={cn(prose, 'mt-3 text-[16px]')}>{description}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
          <span className="text-[12px] text-muted">
            Last updated <span className="nums font-semibold text-ink">{dateShort(updated)}</span>
          </span>
          <span aria-hidden="true" className="hidden h-3 w-px bg-line-strong sm:block" />
          <span className="text-[12px] text-muted">
            <span className="nums font-semibold text-ink">{flat.length}</span> sections
          </span>
          <Badge tone="warning">Beta — payments not open</Badge>
        </div>
      </header>

      <div className="mt-8 lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-12">
        {/* Desktop index */}
        <nav
          aria-label="Sections of this document"
          className="hidden lg:block"
        >
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6 pr-2">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted">On this page</p>
            {numbered.map((part) => (
              <div key={part.part} className="mb-5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/60">{part.part}</p>
                <ul className="space-y-px border-l border-line">
                  {part.sections.map((s) => {
                    const on = active === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => scrollToSection(s.id)}
                          aria-current={on ? 'true' : undefined}
                          className={cn(
                            'group -ml-px flex w-full items-baseline gap-2 border-l-2 py-1.5 pl-3 pr-1 text-left text-[13px] leading-snug transition-colors',
                            on
                              ? 'border-primary font-semibold text-ink'
                              : 'border-transparent text-muted hover:border-line-strong hover:text-ink'
                          )}
                        >
                          <span className={cn('nums text-[11px] tabular-nums', on ? 'text-primary' : 'text-muted/70')}>
                            {s.n}
                          </span>
                          <span className="min-w-0">{s.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0">
          {/* Mobile jump-to */}
          <div className="sticky top-16 z-30 -mx-4 mb-6 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
            <label htmlFor="legal-jump" className="block text-[11px] font-bold uppercase tracking-wider text-muted">
              Jump to section
            </label>
            <select
              id="legal-jump"
              value={active}
              onChange={(e) => scrollToSection(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {numbered.map((part) => (
                <optgroup key={part.part} label={part.part}>
                  {part.sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.n}. {s.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {numbered.map((part) => (
            <div key={part.part}>
              <h2 className="mb-6 mt-10 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-muted first:mt-0">
                {part.part}
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
              </h2>
              {part.sections.map((s) => (
                <section
                  key={s.id}
                  id={s.id}
                  tabIndex={-1}
                  aria-labelledby={`${s.id}-h`}
                  className="scroll-mt-24 border-t border-line py-7 first:border-t-0 focus:outline-none"
                >
                  <h3 id={`${s.id}-h`} className="font-display text-[19px] font-extrabold leading-snug tracking-tight text-ink sm:text-[21px]">
                    <span className="nums mr-2 text-[13px] font-bold text-primary align-[3px]">{s.n}</span>
                    {s.title}
                  </h3>
                  <div className="mt-3">
                    {s.body.map((b, i) => <Block key={i} b={b} />)}
                  </div>
                </section>
              ))}
            </div>
          ))}

          <ContactBlock intro={contactIntro} />

          <p className="mt-8 max-w-[72ch] text-[13px] text-muted">
            Also read:{' '}
            <Link to="/terms" className="font-semibold text-primary underline underline-offset-2">Terms &amp; Conditions</Link>
            {' · '}
            <Link to="/privacy" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>
            {' · '}
            <Link to="/about" className="font-semibold text-primary underline underline-offset-2">About RazeKit</Link>
            {' · '}
            <Link to="/contact" className="font-semibold text-primary underline underline-offset-2">Contact</Link>
          </p>
        </div>
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => {
            let reduce = false;
            try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* noop */ }
            window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
          }}
          className="fixed bottom-5 right-4 z-40 grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface text-ink shadow-md transition-colors hover:border-primary/50 sm:bottom-6 sm:right-6"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Back to top</span>
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TERMS & CONDITIONS
   ══════════════════════════════════════════════════════════════════════ */

const TERMS_PARTS = [
  {
    part: 'A — The agreement',
    sections: [
      {
        id: 'introduction', title: 'Introduction',
        body: [
          'These Terms and Conditions govern your use of RazeKit — the website, the application, and every feature inside it. They apply whether you are browsing without an account, competing in contests as a creator, or running contests as a client.',
          'By creating an account or using RazeKit, you agree to these Terms. If you do not agree with any part of them, please do not use the platform.',
          'RazeKit is currently operating a beta experience while selected platform infrastructure, including automated payment services, continues to be developed. Some features described here are limited, paused, or performed manually during the beta, and each such case is stated plainly in the section it belongs to.',
        ],
      },
      {
        id: 'about-razekit', title: 'About RazeKit',
        body: [
          'RazeKit is a creator-focused contest and collaboration platform. Brands create contests with defined requirements and prize opportunities. Creators discover those opportunities, participate, submit their work, and build a professional track record through their participation and performance.',
          'RazeKit provides and operates the contest structure: the brief, the rules, the measurement of performance, the selection of a winner, and the records that follow from it.',
          { list: [
            'RazeKit is not a bank, an escrow service, or a regulated payment institution.',
            'RazeKit is not an employer, a staffing agency, or an agent of either side.',
            'RazeKit is not an influencer directory and not a social network.',
            'RazeKit does not guarantee that any contest will be created, funded, completed, or paid.',
          ] },
          { note: 'How RazeKit should be characterised for regulatory purposes — in particular holding client funding in an ordinary business bank account — has not been reviewed against Indian payment-aggregator rules. This should be settled with a qualified professional before the platform scales beyond the beta.' },
        ],
      },
      {
        id: 'definitions', title: 'Definitions',
        body: [
          'These words have specific meanings throughout this document.',
          { defs: [
            ['Platform', 'RazeKit, including the website, the application and all features within it.'],
            ['Account', 'A registered user profile on the platform.'],
            ['Visitor', 'Someone using RazeKit without participating — browsing open contests and finalized results.'],
            ['Creator', 'An account type that discovers contests, submits work, and can be selected as a winner.'],
            ['Client', 'An account type that creates and funds contests and reviews submissions.'],
            ['Contest', 'A brief published by a client, with requirements, a prize opportunity and a deadline.'],
            ['Requirements', 'The written brief: the deliverable, format, platform, tone and deadline.'],
            ['Mandatory criteria', 'Conditions a submission must meet to be eligible at all.'],
            ['Custom instructions', 'Additional brand-specific guidance attached to a contest.'],
            ['Submission', 'The work a creator enters into a contest.'],
            ['Tracked link', 'A RazeKit-issued link used to measure verified traffic reaching the brand.'],
            ['Video Engagement', 'A 0–100 measure of how the creative work performed across supported signals.'],
            ['Brand Traffic', 'A 0–100 measure of verified people who actually reached the brand.'],
            ['Final Score', 'The combined result: 50% Video Engagement + 50% Brand Traffic.'],
            ['Winner', 'The eligible creator with the highest verified Final Score once a contest is finalized.'],
            ['Prize commitment', 'A record on RazeKit’s books that a funded prize amount is committed to one contest.'],
            ['Contest funding', 'Money a client transfers to RazeKit so a contest’s prize can be committed.'],
            ['RazeKit balance', 'The amount RazeKit’s records show is held for, or owed to, an account.'],
            ['Withdrawal request', 'A creator’s request to have an owed amount transferred to their bank.'],
            ['Handover', 'A limited, contest-scoped grant of access to a brand-owned channel or account.'],
            ['Beta', 'The current stage of the platform, in which some infrastructure is still being built.'],
          ] },
        ],
      },
      {
        id: 'account-registration', title: 'Account registration',
        body: [
          'You need an account to participate. Registration requires accurate information, and you are responsible for keeping it accurate.',
          { list: [
            'You must be at least 18 years old, or the age of majority where you live, whichever is higher.',
            'The information you register with — including your name — must be true and yours.',
            'One person or organisation should hold one account, unless RazeKit has agreed otherwise in writing.',
            'You are responsible for your credentials and for everything done through your account.',
            'Tell us immediately if you believe your account has been accessed by someone else.',
            'RazeKit may verify your email address and may refuse, restrict or close an account.',
          ] },
        ],
      },
      {
        id: 'account-types', title: 'Account types',
        body: [
          'Your account type is chosen when you join and shapes what the platform lets you do.',
          { defs: [
            ['Visitor', 'Browse open contests and finalized winners. No participation, no submissions, no balance.'],
            ['Creator', 'Discover and join contests, submit work, follow scores in Tracker, build a public track record, and request a withdrawal of prize money owed.'],
            ['Client', 'Create and prepare contests, fund a prize, review submissions, and see campaign performance.'],
          ] },
          'Changing your account type after sign-up requires RazeKit support. Some records — a submission history, a finalized win, a financial record — cannot be moved between account types.',
        ],
      },
    ],
  },
  {
    part: 'B — Running and entering contests',
    sections: [
      {
        id: 'client-responsibilities', title: 'Client responsibilities',
        body: [
          'If you publish contests, you take on the following.',
          { list: [
            'Publish a brief that honestly describes the work you want and the prize you are offering.',
            'Fund the prize. A contest goes live only once its prize is funded and committed.',
            'Hold the rights to any brand assets, trademarks, footage or music you supply.',
            'Review submissions in good faith and within the timeframe the contest states.',
            'Supply anything the brief promises — assets, briefs, approvals, or handover access — without unreasonable delay.',
            'Do not ask creators for work outside the contest without a separate agreement.',
            'Do not ask for, reward, or tolerate purchased engagement, bot traffic, or misleading claims about your product.',
            'Do not ask a creator for the password to their personal social media account. RazeKit never asks for one either.',
          ] },
        ],
      },
      {
        id: 'creator-responsibilities', title: 'Creator responsibilities',
        body: [
          'If you enter contests, you take on the following.',
          { list: [
            'Submit original work that you made and have the right to submit.',
            'Meet the mandatory criteria and follow the custom instructions of the contest you entered.',
            'Use the tracked link exactly as issued, where the contest requires one.',
            'Do not buy, incentivise, automate or otherwise fake views, likes, comments, shares, saves, followers or clicks.',
            'Keep your submitted work publicly accessible while the contest is running and during verification.',
            'Keep your own platform accounts in good standing — a suspended or deleted source account can make performance impossible to verify.',
            'Give accurate bank details when you request a withdrawal. A payout goes where you tell us to send it.',
          ] },
        ],
      },
      {
        id: 'contest-creation', title: 'Contest creation',
        body: [
          'A client creates a contest by defining its title, category, brief, requirements, prize amount and duration.',
          'A contest is a draft until its prize is funded. Publishing a draft does not open it to creators, and no creator is asked to work on an unfunded contest.',
          'While RazeKit’s payment mode is set to maintenance, prize funding is not open. You can create and prepare a contest now; it goes live when its prize has been funded, once an automated payment provider is connected. See section 27.',
        ],
      },
      {
        id: 'contest-requirements', title: 'Contest requirements',
        body: [
          'The requirements are the written part of the brief: what to make, in what format, for which platform, in what tone, and by when.',
          'Requirements are binding on entry. A submission that ignores them may be marked non-compliant and excluded from scoring, whatever its performance.',
          'A client may not materially change the requirements of a live contest in a way that disadvantages creators who have already submitted. Where a clarification is needed, it is added as a clarification, not a replacement.',
        ],
      },
      {
        id: 'mandatory-criteria', title: 'Mandatory criteria',
        body: [
          'Mandatory criteria are the explicit, checkable conditions every submission must meet — for example the platform the work must be published on, the required use of the tracked link, a format, a length, or a required disclosure.',
          'Mandatory criteria are pass or fail. A submission that fails one is ineligible for the prize no matter how well it performs, and the reason is recorded on the submission.',
        ],
      },
      {
        id: 'custom-instructions', title: 'Custom instructions',
        body: [
          'Custom instructions are brand-specific guidance a client adds beyond the mandatory criteria: references, do-not-use lists, tone notes, product facts, hashtags.',
          'They shape the quality of the work and are considered during review. They affect eligibility only when the contest marks them as mandatory.',
        ],
      },
      {
        id: 'collaboration', title: 'Collaboration',
        body: [
          'Some contests involve working directly with the client — sharing assets, receiving feedback, getting an approval before publishing.',
          'Keep that communication on RazeKit wherever the platform provides a channel for it. Conversations moved off-platform cannot be referenced later in a dispute.',
          'Collaboration on a contest does not create employment, partnership, agency, or an exclusive relationship between the client and the creator, or between either of them and RazeKit.',
        ],
      },
      {
        id: 'account-handover', title: 'Account handover',
        body: [
          'A contest may require posting on a channel the client owns, or temporary access to a brand-owned account. RazeKit provides a handover flow for exactly this.',
          { list: [
            'Handover is limited to what the contest states, and to the period the contest states.',
            'It is granted through the handover flow so that the grant, its scope and its end are recorded.',
            'Never share the password to a personal account. RazeKit does not ask for social media passwords and stores no access token.',
            'Access granted through handover must not be used for anything outside the contest, and must not be retained after it ends.',
            'The account owner is responsible for revoking access promptly once the contest closes.',
          ] },
        ],
      },
      {
        id: 'contest-duration', title: 'Contest duration',
        body: [
          'RazeKit derives the allowed duration window from the prize value, so timelines stay fair and predictable on both sides. The window is enforced by the server, not just by the form.',
          { list: [
            'A client cannot choose a duration outside the window allowed for its prize.',
            'No contest may run longer than 30 days.',
            'The deadline shown on a contest is the deadline. Work submitted after it is not counted.',
          ] },
        ],
      },
      {
        id: 'participation', title: 'Participation',
        body: [
          'Creators join a live contest from the contest page, before its deadline.',
          { list: [
            'Entering a contest is free. RazeKit does not charge creators an entry fee.',
            'Where a contest limits how many entries one creator may make, the limit is stated on the contest and enforced by the platform.',
            'Joining is not a promise of a prize. Only a finalized winner receives one.',
            'A creator may withdraw from a contest before submitting. Withdrawing after a result is finalized is not possible.',
          ] },
        ],
      },
      {
        id: 'submission-requirements', title: 'Submission requirements',
        body: [
          'A submission must be entered through the platform before the deadline, in the format the contest requires.',
          { list: [
            'Where the contest requires published work, the link must be live, public and reachable.',
            'Where the contest requires a tracked link, that exact link must be used so brand traffic can be attributed.',
            'The work must stay accessible while the contest runs and through verification. Deleting it, making it private, or replacing it can invalidate the entry.',
            'Work that was created for, or already submitted to, another contest may be excluded unless the brief allows it.',
          ] },
        ],
      },
      {
        id: 'compliance-checks', title: 'Compliance checks',
        body: [
          'Every submission is checked before it can count. Some checks are automated, some are done by a person.',
          { list: [
            'Mandatory criteria are met.',
            'The tracked link is present, valid, and attributed to the submitting creator.',
            'The work is reachable and belongs to the account that submitted it.',
            'The work is not duplicated, re-uploaded, or taken from someone else.',
            'The performance signals do not show patterns consistent with purchased, automated or incentivised activity.',
          ] },
          'A submission that fails a check is flagged and the reason is recorded. Activity that cannot be verified may be excluded from performance calculations rather than counted at face value.',
        ],
      },
      {
        id: 'eligibility', title: 'Eligibility',
        body: [
          'To be eligible for a prize, all of the following must be true.',
          { steps: [
            'The account is active and in good standing.',
            'The creator joined the contest before its deadline.',
            'The submission arrived before the deadline.',
            'Every mandatory criterion is met.',
            'Compliance checks passed.',
            'The result survived winner verification.',
          ] },
          'Suspended accounts, accounts under an unresolved fraud review, RazeKit staff, and seed, demo, test or simulation accounts are not eligible for prizes.',
        ],
      },
    ],
  },
  {
    part: 'C — Performance and winners',
    sections: [
      {
        id: 'performance-scoring', title: 'Performance scoring',
        body: [
          'Performance has exactly two dimensions. Each is normalised to a 0–100 scale within the contest, so entries are compared against the field they actually competed in.',
          'While a contest is running, scores are provisional: they move as new data arrives, and the platform labels them as provisional wherever it shows them. After the deadline, scores are recalculated from verified data and become final. A provisional score is not a result.',
          'Signals that cannot be verified may be excluded from a score. RazeKit will not present an unverifiable number as if it were measured.',
        ],
      },
      {
        id: 'video-engagement', title: 'Video Engagement',
        body: [
          'Video Engagement measures the overall performance of the creative work across supported signals: views, likes, comments, shares, saves, watch time, and follower growth.',
          { list: [
            'It is collected from public data and supported platform integrations.',
            'It is normalised to 0–100 against the other entries in the same contest.',
            'Signals from sources RazeKit cannot read, or that a creator has made private, cannot be counted.',
            'Engagement that shows signs of being purchased, automated or incentivised may be excluded.',
          ] },
        ],
      },
      {
        id: 'brand-traffic', title: 'Brand Traffic',
        body: [
          'Brand Traffic measures verified people who actually reached the brand through the creator’s tracked link.',
          { list: [
            'A view is not a visit. Engagement and traffic are measured separately and are never conflated.',
            'Traffic is filtered: duplicates, automated requests, self-clicks and traffic that cannot be verified are removed before scoring.',
            'Only traffic through the tracked link issued to that creator, for that contest, is attributed to them.',
            'Brand Traffic is normalised to 0–100 against the other entries in the same contest.',
          ] },
        ],
      },
      {
        id: 'final-score', title: 'Final Score',
        body: [
          'Final Score = 50% Video Engagement + 50% Brand Traffic. The highest Final Score among eligible entries wins.',
          { list: [
            'Creator A — Engagement 95, Traffic 60 → Final Score 77.5',
            'Creator B — Engagement 75, Traffic 95 → Final Score 85.0 (wins)',
          ] },
          'The weighting is fixed and identical for every contest. Reach alone does not win, and traffic alone does not win.',
        ],
      },
      {
        id: 'winner-selection', title: 'Winner selection',
        body: [
          'After the deadline, final scores are recalculated from verified data, eligible entries are ranked, and the highest Final Score is selected.',
          { list: [
            'The calculation is deterministic. The same verified data produces the same ranking.',
            'A client cannot override the ranking to select a different entry.',
            'If two eligible entries produce the same Final Score, RazeKit reviews the case and records the basis of the decision.',
            'If no entry is eligible, no winner is selected and the contest closes without a result.',
          ] },
          'AI does not decide winners, authorise money, or alter a score. Where a human decision is required, a person makes it and it is recorded.',
        ],
      },
      {
        id: 'winner-verification', title: 'Winner verification',
        body: [
          'A result is verified before it becomes final.',
          { list: [
            'Verification uses public evidence only — the live public work, the public metrics, and RazeKit’s own tracked-link records.',
            'RazeKit never asks for a social media password and stores no access token for your accounts.',
            'A creator may be asked to keep the work public, or to supply a public link, while verification runs.',
            'If a result cannot be verified — the work was deleted, made private, or the metrics do not hold up — it may be set aside and the next eligible entry considered.',
          ] },
        ],
      },
      {
        id: 'winner-publication', title: 'Winner publication',
        body: [
          'Finalized results are published on RazeKit: on the contest, on the winners listing, and on the creator’s profile as part of their track record. Real account names are used.',
          'A finalized result is a public record and is intended to stay that way — it is what gives a creator a verifiable history. If you believe a published result contains a factual error, contact support and it will be reviewed.',
        ],
      },
    ],
  },
  {
    part: 'D — Money during the beta',
    sections: [
      {
        id: 'prize-commitment', title: 'Prize commitment',
        body: [
          'When a contest is funded, the prize amount is recorded against that contest as a prize commitment, and the contest can go live.',
          { list: [
            'A prize commitment is a record on RazeKit’s books that a specific amount is committed to one specific contest.',
            'It is not escrow, not a trust arrangement, not insurance, and not a guarantee of payment.',
            'Funds are held in an ordinary business bank account, not a segregated client account.',
            'RazeKit is not a bank, an escrow service, or a regulated payment institution.',
          ] },
          { note: 'The legal characterisation of holding client contest funding in an ordinary business bank account, and the obligations that attach to a prize commitment, require professional legal review before the platform scales beyond the beta.' },
        ],
      },
      {
        id: 'beta-payment-funding', title: 'Beta payment and funding',
        body: [
          { verbatim: 'RazeKit is currently operating a beta payment workflow in which selected contest funding and payout operations may be processed manually with verification while automated payment infrastructure is being finalized.' },
          'RazeKit’s payment mode is currently set to maintenance. That means:',
          { list: [
            'Prize funding is not open. No payment method is currently accepting funds.',
            'RazeKit is connecting an automated payment provider. Contest funding will open once that is live.',
            'You can create and prepare a contest now; it goes live when its prize has been funded.',
            'Existing financial records, balances and contest history remain readable and unchanged.',
          ] },
          'Nothing about payment on RazeKit is automatic, instant, guaranteed or protected. No amount is confirmed until a person has verified it and it has been recorded.',
        ],
      },
      {
        id: 'manual-payment-verification', title: 'Manual payment verification',
        body: [
          'This section describes the manual funding workflow as built. It applies whenever manual funding is enabled. It is not in use while payment mode is maintenance.',
          { steps: [
            'The client transfers the amount to RazeKit’s bank account. That transfer happens at the bank, outside this platform.',
            'The client reports the transfer on RazeKit, with its reference.',
            'A member of the RazeKit team checks the report against RazeKit’s actual bank records.',
            'Only after that check succeeds is the amount credited to the client’s RazeKit balance.',
            'The prize is then committed to the contest, and the contest goes live.',
          ] },
          { list: [
            'Reporting a transfer creates nothing. A submitted form is a claim, not money.',
            'Verification cannot be skipped. There is no path from "reported" to "verified" without a person.',
            'If the amount received is short, the receipt is credited because it genuinely arrived, the shortfall is recorded, and the contest does not go live until the balance arrives.',
            'If the amount received is more than due, the contest is funded and the excess stays on the client’s RazeKit balance, flagged as refundable.',
            'Stated verification windows are targets, not guarantees.',
          ] },
        ],
      },
      {
        id: 'payouts', title: 'Payouts',
        body: [
          'When a result is finalized, the prize becomes an amount RazeKit’s records show is owed to that creator.',
          { list: [
            'A creator requests a withdrawal from their Balance page. A minimum withdrawal amount applies and is shown there.',
            'A withdrawal request reserves the amount. It does not move money and does not reduce your total.',
            'One open withdrawal request per creator at a time.',
            'Clients cannot withdraw. Client money leaves only through a reviewed refund. This is deliberate for the beta.',
            'Payouts are made in Indian Rupees.',
          ] },
        ],
      },
      {
        id: 'manual-payout-process', title: 'Manual payout process',
        body: [
          'Payouts are made by a person, in this order, and no stage may be skipped.',
          { steps: [
            'The creator requests a withdrawal; the amount is reserved.',
            'RazeKit reviews the request.',
            'The request is approved. Approval is not payment — no money has moved yet.',
            'A member of the RazeKit team makes the bank transfer manually.',
            'The transfer reference is recorded and the payout is confirmed.',
            'Only then is the amount debited from the creator’s RazeKit balance and marked paid.',
          ] },
          { list: [
            'A failed transfer keeps the reservation, so a creator does not lose money to a bounced payment.',
            'Payout timelines are targets, not guarantees.',
            'RazeKit currently operates with a small team, so the same person may both approve and confirm a payout. Every such case is flagged and recorded on the audit trail. This is a real limitation, stated rather than hidden.',
          ] },
        ],
      },
      {
        id: 'refunds-reversals', title: 'Refunds and reversals',
        body: [
          { list: [
            'A client’s verified but uncommitted balance may be refunded after review.',
            'Prize money committed to a contest may be released back to the client’s balance if the contest is cancelled before a winner is finalized, subject to review.',
            'A refund is approved first and transferred second. Approval alone does not move money.',
            'Platform charges and any tax already booked on a funding receipt may not be refundable.',
            'Correcting a recorded financial entry is done by posting a reversal, which is an audited action. The original entry is never deleted.',
            'Once a prize has been paid to a winner, it is not reversible through a refund.',
          ] },
          { note: 'Refund entitlements, cancellation rights and non-refundable charges are jurisdiction-specific and are not settled by this document. They require professional legal review, particularly for consumer-facing obligations in India.' },
        ],
      },
    ],
  },
  {
    part: 'E — Conduct, content and rights',
    sections: [
      {
        id: 'fraud-abuse', title: 'Fraud and abuse',
        body: [
          'RazeKit only works if the numbers mean something. The following are prohibited.',
          { list: [
            'Purchased, automated, bot-generated or incentivised views, likes, comments, shares, saves, followers or clicks.',
            'Click farms, click exchanges, self-clicking a tracked link, or driving traffic that is not a real person choosing to visit.',
            'Fake, duplicate or sold accounts, and any attempt to circumvent a suspension.',
            'Plagiarised, re-uploaded, licence-infringing or AI-passed-off-as-original work where the brief does not allow it.',
            'Editing, spoofing or misrepresenting performance evidence.',
            'Reporting a bank transfer that was not made, or claiming a reference that belongs to a different payment.',
            'Colluding with a client, a creator, or another entrant to influence a result.',
          ] },
          'Where RazeKit finds any of this, it may exclude the activity from scoring, disqualify the submission, set aside or withhold a prize that has not been paid, suspend or close the account, and take steps to recover any amount obtained through it.',
        ],
      },
      {
        id: 'account-suspension', title: 'Account suspension',
        body: [
          'RazeKit may restrict, suspend or close an account for a breach of these Terms, for signals of fraud, where required by law, or where an identity or payment verification cannot be completed.',
          { list: [
            'A suspended account cannot join contests, submit work, or request a withdrawal.',
            'Records are not deleted by a suspension. Balances, contest history and financial records remain.',
            'A legitimate balance is not forfeited by a suspension, but a withdrawal may be held while a review is open.',
            'You can contact support to ask for a suspension to be reviewed, and RazeKit will tell you what it needs.',
          ] },
        ],
      },
      {
        id: 'content-ip', title: 'Content and intellectual property',
        body: [
          'Creators keep ownership of the work they submit, except to the extent the contest brief states otherwise and the creator agreed to it by entering.',
          { list: [
            'By submitting, you grant RazeKit a non-exclusive licence to host, store, display and reference your submission on the platform — to run the contest, show the result, and present your track record.',
            'Any rights a client receives in the winning work are the rights the contest brief describes. RazeKit does not transfer ownership automatically, and a prize payment is not by itself a transfer of copyright.',
            'Brand assets a client supplies remain the client’s. A creator may use them only for that contest.',
            'The RazeKit name, logo, interface and software remain RazeKit’s.',
            'RazeKit may remove content that is unlawful, infringing, or in breach of these Terms.',
          ] },
          { note: 'The scope, duration and revocability of the licence granted by a submission, and the mechanism by which rights in a winning entry pass to a client, require professional legal review and should be drafted precisely before this clause is relied on.' },
        ],
      },
      {
        id: 'collaboration-handover-rights', title: 'Collaboration and handover rights',
        body: [
          { list: [
            'Access granted through handover is limited to the purpose and the period the contest states.',
            'It must not be used to post unrelated content, change settings, read private messages, or extract data beyond the contest.',
            'It must not be retained, shared, or reused after the contest ends.',
            'The account owner is responsible for revoking the access promptly. RazeKit records the grant and its stated end, but cannot revoke access on a third-party platform for you.',
            'Neither side may ask the other for a personal account password. RazeKit never asks for one.',
            'Misusing handover access is treated as abuse under section 32.',
          ] },
        ],
      },
    ],
  },
  {
    part: 'F — Service, disputes and changes',
    sections: [
      {
        id: 'platform-availability', title: 'Platform availability',
        body: [
          'RazeKit is provided on an "as is" and "as available" basis while it is in beta.',
          { list: [
            'Features may change, pause, or be removed as the platform is built.',
            'Maintenance, outages and third-party failures can interrupt the service.',
            'Metrics depend on external platforms. If a source changes, restricts or removes access to its data, measurement for affected contests may be reduced or unavailable, and RazeKit will say so rather than substitute a number.',
            'RazeKit does not guarantee uninterrupted availability, or that any particular data source will remain accessible.',
          ] },
          { note: 'Limitation of liability, warranty disclaimers, force majeure and indemnity are not drafted in this document. They require professional legal review before RazeKit relies on them.' },
        ],
      },
      {
        id: 'disputes-support', title: 'Disputes and support',
        body: [
          'Contact RazeKit first. Most disputes are a missing record, and the record usually exists.',
          { list: [
            'Open a ticket from the Help Center so the conversation is attached to your account.',
            'Include the contest, the submission link, and the dates involved.',
            'For a financial question, include the transfer reference or the withdrawal request.',
            'RazeKit keeps an audit trail of financial events and will use it to answer you.',
            'Response times are targets, not guarantees.',
          ] },
          { note: 'Governing law, jurisdiction, and any arbitration or dispute-resolution mechanism are deliberately not asserted here. These must be set by a qualified professional; RazeKit will not state a legal conclusion it has not obtained.' },
        ],
      },
      {
        id: 'terms-privacy', title: 'Privacy',
        body: [
          'How RazeKit collects, uses, protects and shares your information is set out in the Privacy Policy, which forms part of your agreement with RazeKit.',
          'Two points are worth repeating here: RazeKit never publicly exposes bank details, and winner verification uses public evidence only — RazeKit never asks for a social media password and stores no access token.',
        ],
      },
      {
        id: 'changes-to-terms', title: 'Changes to these Terms',
        body: [
          'RazeKit is being actively built, and these Terms will change with it.',
          { list: [
            'The "Last updated" date at the top of this page changes whenever the document does.',
            'Where a change is material, RazeKit will make a reasonable effort to tell you in the product or by email.',
            'Continuing to use RazeKit after a change means you accept the updated Terms.',
            'A change does not retroactively alter a finalized contest result or a completed financial record.',
          ] },
        ],
      },
      {
        id: 'terms-contact', title: 'Contact',
        body: [
          'Questions about these Terms, or about anything they cover, go to the RazeKit team directly using the details below.',
        ],
      },
    ],
  },
];

export function Terms() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Terms & Conditions"
      description="The rules for using RazeKit: how contests are created and entered, how performance is measured, how winners are selected, and what actually happens with money during the beta."
      parts={TERMS_PARTS}
      contactIntro="Anything in these Terms that is unclear, or that you think is wrong — tell us and we will look at it."
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PRIVACY POLICY
   ══════════════════════════════════════════════════════════════════════ */

const PRIVACY_PARTS = [
  {
    part: 'A — Scope',
    sections: [
      {
        id: 'privacy-introduction', title: 'Introduction',
        body: [
          'This Privacy Policy explains what information RazeKit collects, why it collects it, how it is protected, who can see it, and what you can ask us to do with it.',
          'It covers the RazeKit website and application, and applies to visitors, creators and clients.',
          'RazeKit is in beta. Where a practice is still being built, or a retention period is not yet defined, this document says so rather than describing something that does not exist.',
        ],
      },
      {
        id: 'privacy-who', title: 'Who this applies to',
        body: [
          'RazeKit operates the platform at razekit.com and decides how the information described here is processed. Support and privacy requests reach the same team, using the contact details at the end of this page.',
          { note: 'The identity of the legal entity responsible for this processing, its registered address, and any registration or representative required under applicable data-protection law must be confirmed by a qualified professional and stated here before this policy is relied on.' },
        ],
      },
    ],
  },
  {
    part: 'B — What we process',
    sections: [
      {
        id: 'data-categories', title: 'Categories of data we process',
        body: [
          'RazeKit processes the following categories. Not all of them apply to every account — a visitor generates far less than a creator who has won a contest.',
          { defs: [
            ['Account data', 'Name, email address, password hash, account type, sign-in method, account status, and the dates of account events.'],
            ['Profile data', 'What you choose to publish about yourself: display name, avatar, bio, categories, links to your public channels.'],
            ['Contest data', 'Contests you create or enter: briefs, requirements, mandatory criteria, custom instructions, prize amounts, durations, deadlines and status.'],
            ['Submissions', 'The entries you submit: links, descriptions, timestamps, compliance results, and the reasons recorded for a flag or an exclusion.'],
            ['Media', 'Files you upload — creative work, avatars, brand assets, and payment proof images where a manual funding flow is in use.'],
            ['Performance metrics', 'Public performance signals for submitted work: views, likes, comments, shares, saves, watch time, follower growth, and the scores derived from them.'],
            ['Traffic and attribution data', 'Records of visits through a RazeKit tracked link, including the verification result and whether the visit was counted or filtered out.'],
            ['Notifications', 'The notifications generated for you and their read state, plus the emails RazeKit sent you about your account or your contests.'],
            ['Support tickets', 'Your messages to support, our replies, the ticket status, and anything you attach to a ticket.'],
            ['Financial transaction records', 'Funding requests, prize commitments, balances, withdrawal requests, payouts, refunds, platform charges and tax records, together with the double-entry ledger behind them.'],
            ['Bank information', 'Bank account details, only where they are necessary for beta funding or a payout — a creator’s account for a withdrawal, or the details a client used to make a transfer.'],
            ['Payment references', 'Transfer references such as a UTR, used to match a real bank movement to a RazeKit record.'],
            ['Device and browser information', 'Technical information sent by your browser when you use RazeKit, such as browser and device type, and the IP address a request came from.'],
            ['Security and audit records', 'Sign-in events, administrative actions, permission grants, and a permanent audit trail of every financial event.'],
          ] },
        ],
      },
      {
        id: 'data-sources', title: 'Where the data comes from',
        body: [
          { list: [
            'From you — registration, your profile, contests, submissions, uploads, support messages, and withdrawal details.',
            'From your use of RazeKit — what you created, entered, scored and were paid.',
            'From public sources — publicly available performance data for work you submitted to a contest.',
            'From RazeKit’s own systems — tracked-link records, compliance results, notifications, ledger entries and audit records.',
            'From service providers that operate part of the platform, such as hosting, file storage and email delivery.',
          ] },
        ],
      },
      {
        id: 'purposes', title: 'Why we process it',
        body: [
          { defs: [
            ['Running the platform', 'Creating and securing your account, showing you the right screens, and letting you take part.'],
            ['Running contests', 'Publishing briefs, accepting submissions, checking compliance, and enforcing deadlines and eligibility.'],
            ['Measuring performance', 'Collecting supported public signals and verified traffic, computing Video Engagement, Brand Traffic and the Final Score.'],
            ['Selecting and verifying winners', 'Ranking eligible entries and confirming a result against public evidence before it is finalized.'],
            ['Publishing results', 'Showing finalized winners and building the public track record that gives creators a verifiable history.'],
            ['Handling money', 'Recording funding, prize commitments, balances, withdrawals, payouts and refunds, and keeping the ledger that explains every figure.'],
            ['Preventing fraud', 'Detecting purchased engagement, automated traffic, duplicate accounts and false payment reports.'],
            ['Supporting you', 'Answering tickets, investigating disputes, and explaining what happened using the audit trail.'],
            ['Communicating', 'Notifications and emails about your account, your contests, your submissions and your money.'],
            ['Meeting obligations', 'Keeping the financial and audit records a platform that handles money has to keep.'],
          ] },
          { note: 'The lawful bases for each of these purposes, and whether consent is required for any of them in a given jurisdiction, have not been determined here and require professional legal review.' },
        ],
      },
    ],
  },
  {
    part: 'C — Protection and limits',
    sections: [
      {
        id: 'public-evidence-only', title: 'Public evidence only — no passwords, no tokens',
        body: [
          'This is a firm commitment, not a preference.',
          { list: [
            'RazeKit never asks for the password to your social media accounts, and no part of the product has a field for one.',
            'RazeKit stores no access token for your personal accounts.',
            'Winner verification uses public evidence only: the live public work, its publicly visible metrics, and RazeKit’s own tracked-link records.',
            'If someone contacts you claiming to be from RazeKit and asks for a password or a one-time code, it is not us. Report it using the contact details below.',
          ] },
        ],
      },
      {
        id: 'bank-details', title: 'Bank details are never public',
        body: [
          'Bank information is the most sensitive data RazeKit holds, and it is handled accordingly.',
          { list: [
            'RazeKit never publicly exposes bank details. They appear on no profile, no contest page, no winners listing and no public endpoint.',
            'Everywhere they are shown internally, account numbers, branch codes and UPI identifiers are masked.',
            'A full account number is returned by exactly one authorised path, to exactly the person entitled to see it, and every such read is recorded in the audit trail.',
            'Account numbers are not written to logs. Audit records carry only the last few digits.',
            'Payment proof images and payment configuration files are kept in private storage and are opened through short-lived links issued per view, never a public URL.',
          ] },
        ],
      },
      {
        id: 'security', title: 'Security',
        body: [
          { list: [
            'Access to financial data is granted per capability, not by a blanket "admin" role, and each grant is recorded with who granted it and when.',
            'Financial records can only be written by the server. No browser session can write a balance, a ledger entry or a funding status.',
            'Balances are derived from ledger entries and can be rebuilt and reconciled, so a corrupted figure is detectable rather than silent.',
            'Every financial event is written to an audit trail that is never deleted. Corrections are posted as reversals.',
            'Uploads are checked by type and content, stored under server-generated keys, and size-capped.',
            'No security measure is perfect. If we become aware of a breach affecting you, we will act on it and tell you what we know.',
          ] },
        ],
      },
      {
        id: 'who-can-see', title: 'Who can see your data',
        body: [
          { defs: [
            ['You', 'Everything on your own account, plus the finalized public record of contests you took part in.'],
            ['Other users', 'Only what is public: your profile, your submitted work where the contest publishes it, and finalized results. Never your email address, your bank details or your balance.'],
            ['Clients', 'For their own contests: the submissions entered, the performance of those submissions, and the creators who entered.'],
            ['RazeKit team', 'Only the data a specific task needs, gated by the permission for that task and recorded when it involves financial or sensitive data.'],
            ['Service providers', 'Hosting, database, file storage and email delivery providers process data on RazeKit’s instructions so the platform can run.'],
            ['Legal', 'Where RazeKit is required by law to disclose information, or needs to in order to establish or defend a legal claim.'],
          ] },
          'RazeKit does not sell your personal data, and does not share it with advertisers.',
          { note: 'Whether any service provider processes data outside your country, and what transfer mechanism would be required for that, has not been assessed here and needs professional legal review.' },
        ],
      },
    ],
  },
  {
    part: 'D — Your data, and changes',
    sections: [
      {
        id: 'access-correction', title: 'Access, correction and requests',
        body: [
          'You can ask RazeKit about the data it holds on you.',
          { list: [
            'Most profile and account data can be viewed and corrected directly in Settings.',
            'For anything else, email the address at the end of this page from the address on your account, or open a support ticket.',
            'Tell us what you want: a copy of your data, a correction, deletion of something specific, or an explanation of how a figure was calculated.',
            'We may need to confirm your identity before acting on a request about someone’s personal data.',
            'We aim to respond promptly. Response times are targets, not guarantees.',
          ] },
          'Some records cannot be deleted on request. A finalized contest result is a public record other people relied on, and financial and audit records exist precisely so that money can be explained later. Where we cannot delete something, we will tell you why.',
        ],
      },
      {
        id: 'retention', title: 'Retention',
        body: [
          { defs: [
            ['Account and profile data', 'Kept while your account exists.'],
            ['Contest, submission and performance data', 'Kept for as long as the contest record exists. Finalized results stay published as part of the public track record.'],
            ['Financial and audit records', 'Kept as permanent records. Financial entries are never deleted; corrections are posted as reversals so the history stays complete.'],
            ['Bank information', 'Kept while it is needed for a funding or payout record and for the financial history that depends on it.'],
            ['Support tickets', 'Kept while the ticket is open and afterwards as a record of what was decided.'],
            ['Media and uploads', 'Kept while the contest or the record they belong to exists. Retiring a file hides it; it does not delete the underlying record.'],
          ] },
          { note: 'Specific retention periods, and the point at which each category should be deleted or anonymised, are not yet defined. They must be set with professional advice rather than asserted here.' },
        ],
      },
      {
        id: 'cookies-storage', title: 'Cookies and browser storage',
        body: [
          { list: [
            'RazeKit stores your sign-in token in your browser so that you stay signed in. Clearing your browser storage signs you out.',
            'Some interface preferences may be stored in your browser so the product remembers how you left it.',
            'Tracked links work through RazeKit’s own redirect records, which is how Brand Traffic is attributed and filtered.',
            'If RazeKit adds analytics or advertising technology, this policy will be updated before it is used.',
          ] },
        ],
      },
      {
        id: 'children', title: 'Age',
        body: [
          'RazeKit is not intended for people under 18, or under the age of majority where they live if that is higher. We do not knowingly collect data from them. If you believe a minor has an account, contact us and we will review it.',
        ],
      },
      {
        id: 'privacy-changes', title: 'Changes to this policy',
        body: [
          'This policy will change as the platform is built — particularly when automated payment infrastructure goes live, which will change how payment data is processed.',
          'The "Last updated" date at the top of this page changes whenever the document does, and material changes will be communicated in the product or by email where we reasonably can.',
        ],
      },
      {
        id: 'privacy-contact', title: 'Contact',
        body: [
          'Privacy questions, data requests and anything that looks wrong go to the RazeKit team directly using the details below.',
        ],
      },
    ],
  },
];

export function Privacy() {
  return (
    <LegalDoc
      eyebrow="Legal"
      title="Privacy Policy"
      description="What RazeKit collects, why, who can see it, and how it is protected. Bank details are never public, and winner verification uses public evidence only."
      parts={PRIVACY_PARTS}
      contactIntro="For a data request, a correction, or anything in this policy that does not match what you see in the product."
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ABOUT
   ══════════════════════════════════════════════════════════════════════ */

const HOW_IT_WORKS = [
  {
    icon: Target, k: 'Brands',
    title: 'Brands create contests',
    body: 'A client publishes a brief with defined requirements, mandatory criteria and a prize opportunity. Clear expectations, set before anyone starts working.',
  },
  {
    icon: Activity, k: 'Creators',
    title: 'Creators participate',
    body: 'Creators discover opportunities that fit their work, join, and submit. Every entry is checked against the contest’s requirements before it can count.',
  },
  {
    icon: Trophy, k: 'Outcome',
    title: 'Performance decides',
    body: 'Two measured dimensions produce one Final Score. The highest eligible score wins, the result is verified, and it becomes part of the creator’s public track record.',
  },
];

const PRINCIPLES = [
  {
    icon: Eye, title: 'No invented numbers',
    body: 'If a value is missing or cannot be verified, RazeKit shows that it is missing. It never substitutes a zero, a placeholder or a promotional figure.',
  },
  {
    icon: ShieldCheck, title: 'Public evidence only',
    body: 'Winner verification uses the live public work and RazeKit’s own tracked-link records. RazeKit never asks for a social media password and stores no access token.',
  },
  {
    icon: Lock, title: 'Nothing is claimed that is not true',
    body: 'RazeKit is not a bank, an escrow service or a regulated payment institution, and does not describe itself as one. Payment is never called automatic, instant or guaranteed.',
  },
  {
    icon: FileText, title: 'Every figure is explainable',
    body: 'Money is recorded as double-entry ledger entries with a permanent audit trail, so any balance on the platform can be traced back to the events that produced it.',
  },
];

function StatsStrip() {
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let alive = true;
    fn('platformStats', {})
      .then((d) => { if (alive) setState({ status: d ? 'ready' : 'failed', data: d }); })
      // A failed call means we omit the section entirely rather than show zeros.
      .catch(() => { if (alive) setState({ status: 'failed', data: null }); });
    return () => { alive = false; };
  }, []);

  if (state.status === 'failed') return null;

  const d = state.data || {};
  const items = [
    { label: 'Creators', value: d.creators },
    { label: 'Brands', value: d.clients },
    { label: 'Contests', value: d.contests },
    { label: 'Completed contests', value: d.completed_contests },
  ];

  return (
    <section className="mt-14 border-t border-line pt-10" aria-labelledby="about-stats">
      <h2 id="about-stats" className="font-display text-xl font-extrabold tracking-tight text-ink">
        Where RazeKit is today
      </h2>
      <p className={cn(prose, 'mt-2')}>
        Real counts, read live from the platform. RazeKit is early, and these are the honest numbers rather than
        promotional ones.
      </p>

      {state.status === 'loading' ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading platform statistics</span>
          {items.map((it) => (
            <Card key={it.label} className="p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-12" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {items.map((it) => {
              const known = Number.isFinite(Number(it.value));
              return (
                <Card key={it.label} className="p-4">
                  <dt className="text-[12px] font-medium text-muted">{it.label}</dt>
                  <dd className={cn('mt-1.5 font-display text-[26px] font-extrabold leading-none', known ? 'nums text-ink' : 'text-[15px] font-semibold text-muted')}>
                    {known ? Number(it.value).toLocaleString('en-IN') : 'Not available'}
                  </dd>
                </Card>
              );
            })}
          </dl>
          {d.excludes && (
            <p className="mt-3 text-[12px] text-muted">Excludes {d.excludes}.</p>
          )}
        </>
      )}
    </section>
  );
}

export function About() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <header className="max-w-[52ch]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">About</p>
        <h1 className="mt-2 font-display text-[32px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[46px]">
          Structured contests, measurable performance, real outcomes.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.75] text-muted sm:text-[17px]">
          RazeKit is a creator-focused contest and collaboration platform, built to connect brands with creative
          talent through structured campaigns, clear requirements, measurable performance and professional
          collaboration.
        </p>
      </header>

      {/* Positioning */}
      <section className="mt-10 border-t border-line pt-8" aria-labelledby="about-what">
        <h2 id="about-what" className="font-display text-xl font-extrabold tracking-tight text-ink">
          What RazeKit is
        </h2>
        <div className="mt-3 max-w-[72ch] space-y-3 text-[15px] leading-[1.75] text-muted">
          <p>
            Brands create contests with defined requirements and prize opportunities. Creators discover those
            opportunities, participate, submit their work, and build a professional track record through their
            participation and performance.
          </p>
          <p>
            The platform is built around four things: clear contest rules, measurable creator performance,
            structured winner selection, and outcome-focused collaboration. A brief says what is wanted. The
            measurement says what happened. The result follows from the measurement, not from a preference.
          </p>
          <p className="text-ink">
            RazeKit is a contest platform. It is not an influencer directory, and it is not a social feed.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-14 border-t border-line pt-10" aria-labelledby="about-how">
        <h2 id="about-how" className="font-display text-xl font-extrabold tracking-tight text-ink">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.k}>
              <Card className="h-full p-5" hover>
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-primary">
                    <s.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="nums text-[11px] font-bold uppercase tracking-wider text-muted/70">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-[17px] font-extrabold tracking-tight text-ink">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Scoring */}
      <section className="mt-14 border-t border-line pt-10" aria-labelledby="about-scoring">
        <h2 id="about-scoring" className="font-display text-xl font-extrabold tracking-tight text-ink">
          How performance is measured
        </h2>
        <p className={cn(prose, 'mt-2')}>
          Two dimensions, each normalised to 0–100 against the other entries in the same contest. They are measured
          separately and never conflated — a view is not a visit.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Dimension 1</p>
            <h3 className="mt-1.5 font-display text-[17px] font-extrabold tracking-tight text-ink">Video Engagement</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              How the creative work performed across supported signals: views, likes, comments, shares, saves, watch
              time and follower growth.
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Dimension 2</p>
            <h3 className="mt-1.5 font-display text-[17px] font-extrabold tracking-tight text-ink">Brand Traffic</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Verified people who actually reached the brand through the creator&rsquo;s tracked link, after
              duplicates and unverifiable traffic are filtered out.
            </p>
          </Card>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-ink px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">The result</p>
          <p className="mt-1.5 font-display text-[17px] font-extrabold tracking-tight text-white sm:text-[19px]">
            Final Score = 50% Video Engagement + 50% Brand Traffic
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
            The highest eligible Final Score wins. The weighting is the same in every contest.{' '}
            <Link to="/terms#final-score" className="font-semibold text-white underline underline-offset-2">
              Read the full scoring terms
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Principles */}
      <section className="mt-14 border-t border-line pt-10" aria-labelledby="about-principles">
        <h2 id="about-principles" className="font-display text-xl font-extrabold tracking-tight text-ink">
          What we hold ourselves to
        </h2>
        <p className={cn(prose, 'mt-2')}>
          A contest platform only works if its numbers can be trusted. These are not marketing lines — they are
          constraints the product is built under.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <li key={p.title}>
              <Card className="h-full p-5">
                <span className="grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-primary">
                  <p.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-[16px] font-extrabold tracking-tight text-ink">{p.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{p.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <StatsStrip />

      {/* Beta */}
      <section className="mt-14 border-t border-line pt-10" aria-labelledby="about-beta">
        <h2 id="about-beta" className="font-display text-xl font-extrabold tracking-tight text-ink">
          Where the platform stands
        </h2>
        <div className={cn(prose, 'mt-3 space-y-3')}>
          <p>
            RazeKit is currently operating a beta experience while selected platform infrastructure, including
            automated payment services, continues to be developed.
          </p>
          <p>
            In practice that means prize funding is not open right now. An automated payment provider is being
            connected, and contest funding will open once that is live. You can create and prepare a contest today;
            it goes live when its prize has been funded. Existing balances, contest history and financial records
            remain readable and unchanged.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button to="/terms#beta-payment-funding" variant="secondary" size="sm">
            How beta payments work
          </Button>
          <Button to="/help" variant="ghost" size="sm">
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            Help Center
          </Button>
        </div>
      </section>

      <ContactBlock
        heading="Talk to us"
        intro="RazeKit is early and small, and that is an advantage here — a question reaches a person, not a queue."
      />

      <p className="mt-8 max-w-[72ch] text-[13px] text-muted">
        Also read:{' '}
        <Link to="/terms" className="font-semibold text-primary underline underline-offset-2">Terms &amp; Conditions</Link>
        {' · '}
        <Link to="/privacy" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>
        {' · '}
        <Link to="/contact" className="font-semibold text-primary underline underline-offset-2">Contact</Link>
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTACT
   ══════════════════════════════════════════════════════════════════════ */

const CONTACT_CARDS = [
  {
    icon: Phone, label: 'Phone', value: CONTACT.phone, href: CONTACT.phoneHref,
    body: 'Call the RazeKit support line. Best when something is time-sensitive — a contest closing, a submission that will not go through.',
    action: 'Call now',
  },
  {
    icon: Mail, label: 'Email', value: CONTACT.email, href: CONTACT.emailHref,
    body: 'Best for anything that needs detail or an attachment: a payment reference, a screenshot, a data request, a legal question.',
    action: 'Send an email',
  },
  {
    icon: MessageCircle, label: 'WhatsApp support', value: 'Chat on WhatsApp', href: CONTACT.whatsapp,
    body: 'Quick questions during the beta. Message the same number and someone from the team will pick it up.',
    action: 'Open WhatsApp', external: true,
  },
];

const CONTACT_TOPICS = [
  { title: 'A contest or a submission', items: ['The contest name or link', 'Your submission link', 'What you expected and what happened instead'] },
  { title: 'A score or a result', items: ['The contest', 'Which score looks wrong — Video Engagement, Brand Traffic or Final Score', 'Whether it is showing as provisional or final'] },
  { title: 'Money', items: ['The funding request or the withdrawal request', 'The transfer reference, if there is one', 'The date the transfer was made'] },
  { title: 'Your account or your data', items: ['The email address on the account', 'What you want — a copy, a correction, or a deletion', 'Any deadline you are working to'] },
];

export function Contact() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <header className="max-w-[52ch]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Contact</p>
        <h1 className="mt-2 font-display text-[32px] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-[46px]">
          Get in touch with RazeKit.
        </h1>
        <p className="mt-4 text-[16px] leading-[1.75] text-muted sm:text-[17px]">
          Three ways to reach the team directly, and one place inside the product that keeps the conversation
          attached to your account.
        </p>
      </header>

      {/* Direct methods */}
      <section className="mt-10" aria-labelledby="contact-direct">
        <h2 id="contact-direct" className="sr-only">Direct contact methods</h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {CONTACT_CARDS.map((c) => (
            <li key={c.label}>
              <Card className="flex h-full flex-col p-5" hover>
                <span className="grid h-10 w-10 place-items-center rounded-md bg-surface-2 text-primary">
                  <c.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted">{c.label}</p>
                <p className="mt-1 break-words font-display text-[17px] font-extrabold tracking-tight text-ink">
                  {c.value}
                </p>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{c.body}</p>
                <a
                  href={c.href}
                  {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-primary/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {c.action}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* Support inside the product */}
      <section className="mt-12 border-t border-line pt-10" aria-labelledby="contact-help">
        <h2 id="contact-help" className="font-display text-xl font-extrabold tracking-tight text-ink">
          Support inside RazeKit
        </h2>
        <p className={cn(prose, 'mt-2')}>
          If you have an account, a support ticket is usually the fastest route. It arrives with your account,
          your contests and your records already attached, so nobody has to ask you for them.
        </p>
        <div className="mt-5">
          <Button to="/help" variant="primary" size="md">
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            Open the Help Center
          </Button>
        </div>
        <p className="mt-4 max-w-[72ch] text-[13px] leading-relaxed text-muted" role="note">
          RazeKit is a small team in beta. We answer as quickly as we can, and every financial event is backed by an
          audit trail we can read to answer you properly. Response times are targets, not guarantees.
        </p>
      </section>

      {/* What to include */}
      <section className="mt-12 border-t border-line pt-10" aria-labelledby="contact-include">
        <h2 id="contact-include" className="font-display text-xl font-extrabold tracking-tight text-ink">
          What to include
        </h2>
        <p className={cn(prose, 'mt-2')}>
          Including these up front usually removes an entire round trip.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {CONTACT_TOPICS.map((t) => (
            <Card key={t.title} className="p-5">
              <h3 className="font-display text-[15px] font-extrabold tracking-tight text-ink">{t.title}</h3>
              <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
                {t.items.map((it, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0">{it}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Safety note */}
      <section className="mt-12" aria-labelledby="contact-safety">
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 id="contact-safety" className="flex items-center gap-2 font-display text-[15px] font-extrabold tracking-tight text-ink">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            How to tell it is really us
          </h2>
          <ul className="mt-3 max-w-[72ch] space-y-2 text-[14px] leading-relaxed text-muted">
            <li className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>RazeKit will never ask for the password to your social media accounts, or for a one-time code.</span>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>RazeKit will never ask you to send a prize payment, a fee, or a deposit in order to receive a payout.</span>
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>
                The only contact details we use are the ones on this page. If something looks off, reach us at{' '}
                <a href={CONTACT.emailHref} className="break-words font-semibold text-primary underline underline-offset-2">
                  {CONTACT.email}
                </a>{' '}
                and ask.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <p className="mt-10 max-w-[72ch] text-[13px] text-muted">
        Also read:{' '}
        <Link to="/about" className="font-semibold text-primary underline underline-offset-2">About RazeKit</Link>
        {' · '}
        <Link to="/terms" className="font-semibold text-primary underline underline-offset-2">Terms &amp; Conditions</Link>
        {' · '}
        <Link to="/privacy" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>
      </p>
    </div>
  );
}
