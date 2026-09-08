import { Link } from 'react-router-dom';
import { User, Bell, Shield, Wallet, FileText, Trash2, LogOut, ChevronRight, Languages } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n/I18nContext';
import PageHeader from '@/components/ui/PageHeader';

export default function Settings() {
  const { user, logout } = useAuth();
  const { t, localeMeta } = useI18n();
  const isClient = user?.user_role === 'client';
  const languageDesc = `${localeMeta.nativeName} · ${t('settings.language.desc')}`;

  const sections = [
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
    <div className="page-shell pb-10">
      <div className="max-w-4xl mx-auto space-y-5">
        <PageHeader title={t('settings.title')} />
        <div className="surface-2 p-4 md:p-5"><p className="text-[11px] uppercase tracking-[.14em] font-semibold text-primary">Account control center</p><p className="mt-1 text-sm text-muted-foreground">Manage profile, language, notifications, privacy, payments and account access without leaving the RazeKit shell.</p></div>

        {sections.map((section) => (
          <section key={section.group} className="space-y-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{section.group}</h2>
            <div className="surface overflow-hidden divide-y divide-border/60">
              {section.items.map(({ icon: Icon, label, desc, to }) => (
                <Link key={to} to={to} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-secondary/30 transition-colors">
                  <span className="flex items-center gap-3 min-w-0"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary shrink-0"><Icon className="w-4 h-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground truncate">{desc}</span></span></span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">{t('settings.group.accountActions')}</h2>
          <div className="surface overflow-hidden divide-y divide-border/60">
            <Link to="/settings/delete-account" className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-destructive/[0.03] transition-colors"><span className="flex items-center gap-3 text-sm font-semibold text-destructive"><Trash2 className="w-4 h-4" /> {t('settings.deleteAccount.label')}</span><ChevronRight className="w-4 h-4 text-muted-foreground" /></Link>
            <button type="button" onClick={logout} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm font-semibold hover:bg-secondary/30 transition-colors"><LogOut className="w-4 h-4" /> {t('settings.logout.label')}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
