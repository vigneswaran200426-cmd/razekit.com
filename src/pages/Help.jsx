import { LifeBuoy, Mail, BookOpen, MessageCircle } from 'lucide-react';
import { PageHeader, Card } from '@/components/ui';

const FAQ = [
  { q: 'How do contests work?', a: 'A brand funds a prize and briefs the work. Creators submit entries, the brand reviews and picks winners, and payouts happen through RazeKit.' },
  { q: 'When do creators get paid?', a: 'The prize is held securely when a contest is funded, and released to the winner after the winner is confirmed (and handover, when required, is complete).' },
  { q: 'What does it cost to launch a contest?', a: 'You fund the prize plus a platform fee shown transparently at checkout before you pay. Nothing is charged twice.' },
  { q: 'How is my work protected?', a: 'Private footage and winner content are access-controlled and only shared through secure, signed links after authorization.' },
];

export default function Help() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader eyebrow="Support" title="Help center" description="Answers to common questions, and how to reach us." />
      <div className="grid sm:grid-cols-3 gap-3">
        {[{ icon: BookOpen, t: 'Guides', d: 'How RazeKit works' }, { icon: MessageCircle, t: 'Ask support', d: 'Get help from our team' }, { icon: Mail, t: 'Email us', d: 'support@razekit.com' }].map((x) => (
          <Card key={x.t} className="p-4" hover><span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary"><x.icon className="w-4 h-4" /></span><p className="mt-2.5 font-semibold text-ink text-sm">{x.t}</p><p className="text-xs text-muted">{x.d}</p></Card>
        ))}
      </div>
      <Card className="divide-y divide-line">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-ink text-sm">{f.q}<span className="text-muted group-open:rotate-45 transition-transform text-lg leading-none">+</span></summary>
            <p className="mt-2 text-sm text-muted leading-relaxed">{f.a}</p>
          </details>
        ))}
      </Card>
    </div>
  );
}
