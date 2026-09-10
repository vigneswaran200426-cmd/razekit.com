// The app footer.
//
// Its job is small and specific: make the legal pages and real support channels
// reachable from anywhere, without competing with the page above it. Quiet by
// design — a footer that shouts is a footer that steals attention from the work.
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { RazekitWordmark } from '@/components/Brand';

// One source of truth for how RazeKit is contacted, so the footer, Help,
// support and the legal pages can never drift apart.
export const SUPPORT = {
  phone: '+91 8608911369',
  phoneHref: 'tel:+918608911369',
  email: 'razekitchat@razekit.com',
  emailHref: 'mailto:razekitchat@razekit.com',
  whatsappHref: 'https://wa.me/918608911369',
};

const LINKS = [
  { to: '/about', label: 'About' },
  { to: '/winners', label: 'Winners' },
  { to: '/help', label: 'Help' },
  { to: '/contact', label: 'Contact' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface-2">
      <div className="shell py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <RazekitWordmark className="h-5" />
            <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-muted">
              A contest platform where brands run funded campaigns and creators compete on measured
              performance.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                // 44px min touch target on mobile without bloating the desktop row.
                className="inline-flex min-h-[32px] items-center text-[13px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Support</p>
            <a href={SUPPORT.whatsappHref} target="_blank" rel="noreferrer"
              className="inline-flex min-h-[32px] items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp support
            </a>
            <a href={SUPPORT.emailHref}
              className="inline-flex min-h-[32px] items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" /> {SUPPORT.email}
            </a>
            <a href={SUPPORT.phoneHref}
              className="inline-flex min-h-[32px] items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {SUPPORT.phone}
            </a>
          </div>
        </div>

        <p className="mt-6 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
          RazeKit is currently operating a beta experience while selected platform infrastructure,
          including automated payment services, continues to be developed. RazeKit is not a bank, an
          escrow service or a regulated payment institution.
        </p>
      </div>
    </footer>
  );
}
