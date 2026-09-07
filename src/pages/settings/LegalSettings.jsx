import { useState } from 'react';
import { FileText, Shield, Users, ChevronDown } from 'lucide-react';
import SettingsSection from '@/components/settings/SettingsSection';

const DOCS = [
  {
    key: 'terms',
    icon: FileText,
    title: 'Terms of Service',
    body: `By using this platform you agree to use it lawfully and respectfully. You may only participate in contests you are eligible for, submit original work you own the rights to, and must not misuse footage, misrepresent entries, or attempt to manipulate outcomes, payments or rankings.\n\nBrands fund contests through the secure wallet; prizes are released to winning editors after final delivery is confirmed. The platform applies service fees and escrow rules as displayed during each transaction.\n\nWe may suspend or terminate accounts that violate these terms, attempt fraud, or bypass payment and security controls. Records relating to payments, disputes and legal obligations may be retained even after account closure.`,
  },
  {
    key: 'privacy',
    icon: Shield,
    title: 'Privacy Policy',
    body: `We collect the information needed to operate your account and contests: your name, email, username, profile content, submissions, and transaction records.\n\nYour public profile and posts are visible to other users. Private data such as wallet balances, access logs and support tickets are only visible to you and authorized administrators.\n\nWe do not sell your personal data. We retain records required for legal, tax and dispute resolution purposes. You can manage visibility and notification preferences in Privacy & Security and Notifications settings.`,
  },
  {
    key: 'guidelines',
    icon: Users,
    title: 'Community Guidelines',
    body: `Be respectful. No harassment, hate speech, or personal attacks.\n\nSubmit only original work. Plagiarism, duplicate submissions, or using footage without authorization will result in penalties and may lead to account suspension.\n\nDo not attempt to game XP, rankings, or payments. Quality and fair play are rewarded; cheating is penalized.\n\nRespect brands' footage and licensing terms. Do not redistribute or reuse contest footage outside the agreed scope.`,
  },
];

export default function LegalSettings() {
  const [open, setOpen] = useState(null);
  return (
    <SettingsSection title="Legal">
      <p className="text-sm text-muted-foreground">These documents are read-only.</p>
      <div className="space-y-2">
        {DOCS.map(d => {
          const Icon = d.icon;
          const isOpen = open === d.key;
          return (
            <div key={d.key} className="bg-card border border-border rounded-2xl overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : d.key)} className="w-full flex items-center justify-between p-4">
                <span className="flex items-center gap-3"><Icon className="w-4 h-4 text-muted-foreground" /> <span className="text-sm font-medium">{d.title}</span></span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <div className="px-4 pb-4 text-sm text-muted-foreground space-y-2 whitespace-pre-line">{d.body}</div>}
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}