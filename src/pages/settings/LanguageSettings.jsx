import { useState } from 'react';
import { Languages, ChevronRight } from 'lucide-react';
import SettingsSection from '@/components/settings/SettingsSection';
import GlassCard from '@/components/ui/GlassCard';
import LanguageSelectorModal from '@/components/settings/LanguageSelectorModal';
import { useI18n } from '@/lib/i18n/I18nContext';

// Settings → Language: the canonical place to change the Razekit language.
// Selection takes effect immediately and persists to the account preference.
export default function LanguageSettings() {
  const { t, locale, setLocale, localeMeta } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <SettingsSection title={t('language.title')}>
      <GlassCard className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Languages className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-semibold">{t('language.title')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('language.description')}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${t('language.current')}: ${localeMeta.nativeName}`}
          className="mt-4 w-full flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-white/60 px-4 py-3.5 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors text-left"
        >
          <span className="min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground block">{t('language.current')}</span>
            <span className="text-sm font-semibold">
              {localeMeta.nativeName}
              {localeMeta.englishName.toLowerCase() !== localeMeta.nativeName.toLowerCase() && (
                <span className="text-muted-foreground font-normal"> · {localeMeta.englishName}</span>
              )}
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-primary shrink-0">
            {t('language.change')} <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      </GlassCard>

      <LanguageSelectorModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          setLocale(id);
          setOpen(false);
        }}
      />
    </SettingsSection>
  );
}