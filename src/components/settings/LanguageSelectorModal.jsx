import { useEffect, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/I18nContext';
import { searchLocales } from '@/lib/i18n/registry';

/*
  Language selector — reads entirely from the LocaleRegistry (never hard-coded).
  Search matches native name, English name and locale code ('Tamil', 'தமிழ்', 'ta').
  Selected state uses a check icon + aria-pressed, never color alone.
  Bottom sheet on mobile, centered modal on desktop — matches the Razekit pattern.
*/
export default function LanguageSelectorModal({ open, onClose, onSelect }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const results = searchLocales(query);
  const popular = results.filter((l) => l.popular);
  const rest = results.filter((l) => !l.popular);

  const renderRow = (l) => (
    <button
      key={l.locale}
      type="button"
      onClick={() => onSelect(l.locale)}
      aria-pressed={l.locale === locale}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none transition-colors text-left"
    >
      <span className="flex-1 min-w-0">
        <span className="text-sm font-medium block truncate">{l.nativeName}</span>
        {l.englishName.toLowerCase() !== l.nativeName.toLowerCase() && (
          <span className="text-xs text-muted-foreground block truncate">{l.englishName}</span>
        )}
      </span>
      {l.locale === locale && <Check className="w-4 h-4 text-primary shrink-0" aria-label={t('language.selected')} />}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0C2444]/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('language.selector.title')}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-glass-lg max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-heading text-lg font-bold">{t('language.selector.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('language.selector.search')}
              aria-label={t('language.selector.search')}
              className="w-full h-10 rounded-xl border border-border bg-white/70 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('language.selector.empty')}</p>
          ) : (
            <>
              {popular.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                    {t('language.selector.popular')}
                  </p>
                  <div className="space-y-0.5">{popular.map(renderRow)}</div>
                </div>
              )}
              {rest.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
                    {t('language.selector.all')}
                  </p>
                  <div className="space-y-0.5">{rest.map(renderRow)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}