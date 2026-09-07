import { Link } from 'react-router-dom';
import { User, Bell, Shield, Wallet, FileText, Trash2, LogOut, ChevronRight, Languages } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n/I18nContext';
import PageHeader from '@/components/ui/PageHeader';

export default function Settings() {
  // Identity and logout come from the session provider — the single source of truth.
  const { user, logout } = useAuth();
  const { t, localeMeta } = useI18n();
  const handleLogout = () => logout();

  const isClient = user?.user_role === 'client';
  const languageDesc = `${localeMeta.nativeName} · ${t('settings.language.desc')}`;

  const SECTIONS = [
    { group: t('settings.group.account'), items: [{ icon: User, label: t('settings.account.label'), desc: t('settings.account.desc'), to: '/settings/account' }] },
    { group: t('settings.group.preferences'), items: [
      { icon: Languages, label: t('settings.language.label'), desc: languageDesc, to: '/settings/language' },
      { icon: Bell, label: t('settings.notifications.label'), desc: t('settings.notifications.desc'), to: '/settings/notifications' },
    ] },
    { group: t('settings.group.privacySecurity'), items: [{ icon: Shield, label: t('settings.privacy.label'), desc: t('settings.privacy.desc'), to: '/settings/privacy' }] },
    { group: t('settings.group.payments'), items: [{ icon: Wallet, label: isClient ? t('settings.payments.labelClient') : t('settings.payments.labelCreator'), desc: isClient ? t('settings.payments.descClient') : t('settings.payments.descCreator'), to: '/settings/payments' }] },
    { group: t('settings.group.legal'), items: [{ icon: FileText, label: t('settings.legal.label'), desc: t('settings.legal.desc'), to: '/settings/legal' }] },
  ];

  return (
    <div className="page-shell max-w-3xl lg:max-w-4xl mx-auto space-y-6 pb-8">
      <PageHeader title={t('settings.title')} />

      {SECTIONS.map(sec => (
        <div key={sec.group} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{sec.group}</h2>
          <div className="space-y-2">
            {sec.items.map(item => {
              const Icon = item.icon;
              return (
                <Link key={item.label} to={item.to} className="flex items-center justify-between glass-card rounded-2xl px-4 py-3.5 hover-lift">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></span>
                    <span className="min-w-0">
                      <span className="text-sm font-medium block">{item.label}</span>
                      <span className="text-xs text-muted-foreground block truncate">{item.desc}</span>
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{t('settings.group.accountActions')}</h2>
        <Link to="/settings/delete-account" className="flex items-center justify-between glass-card rounded-2xl px-4 py-3.5 hover-lift">
          <span className="text-sm font-medium flex items-center gap-3 text-destructive"><Trash2 className="w-4 h-4" /> {t('settings.deleteAccount.label')}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <button onClick={handleLogout} className="flex items-center justify-between glass-card rounded-2xl px-4 py-3.5 hover-lift w-full">
          <span className="text-sm font-medium flex items-center gap-3"><LogOut className="w-4 h-4" /> {t('settings.logout.label')}</span>
        </button>
      </div>
    </div>
  );
}