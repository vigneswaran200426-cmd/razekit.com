import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { DEFAULT_LOCALE, localeById, resolveLocale } from './registry';
import { RESOURCES } from './translations';

/*
  Razekit I18nProvider — the ONE active-locale source for the whole app.
  Precedence: explicit account preference > explicit local selection >
  browser locale > English. Language is presentation only: it never touches
  auth, roles, wallet, market, currency or any user/business data.
*/
const STORAGE_KEY = 'rz_locale';
const I18nContext = createContext(null);

function detectBrowserLocale() {
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const c of candidates) {
    const loc = resolveLocale(c);
    if (loc) return loc.locale;
  }
  return null;
}

function initialLocale(user) {
  return resolveLocale(user?.preferred_locale)?.locale
    || resolveLocale(localStorage.getItem(STORAGE_KEY))?.locale
    || detectBrowserLocale()
    || DEFAULT_LOCALE;
}

export function I18nProvider({ children }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [locale, setLocaleState] = useState(() => initialLocale(user));

  // When the session loads, an explicit account preference is canonical.
  useEffect(() => {
    const acc = resolveLocale(user?.preferred_locale);
    if (user?.id && acc && acc.locale !== locale) setLocaleState(acc.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.preferred_locale]);

  // A visitor's explicit choice carries over to the account on first login/signup.
  useEffect(() => {
    if (user?.id && !user.preferred_locale) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && resolveLocale(stored)) {
        base44.auth.updateMe({ preferred_locale: stored }).catch(() => {});
      }
    }
  }, [user?.id, user?.preferred_locale]);

  // Multi-tab sync: another tab's language change updates this tab too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const loc = resolveLocale(e.newValue);
      if (loc) setLocaleState(loc.locale);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Document language + text direction (RTL for Arabic, Urdu, Hebrew).
  useEffect(() => {
    const meta = localeById(locale) || localeById(DEFAULT_LOCALE);
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.direction;
  }, [locale]);

  // Select → UI updates immediately → preference persisted. On persistence
  // failure the previous locale is restored and the error is shown, never swallowed.
  const setLocale = useCallback(async (nextId) => {
    const next = localeById(nextId);
    if (!next) return;
    const prevId = locale;
    setLocaleState(nextId);
    localStorage.setItem(STORAGE_KEY, nextId);
    if (user?.id) {
      try {
        await base44.auth.updateMe({ preferred_locale: nextId });
      } catch {
        setLocaleState(prevId);
        localStorage.setItem(STORAGE_KEY, prevId);
        toast({
          description: RESOURCES[nextId]?.['language.saveFailed'] || RESOURCES[DEFAULT_LOCALE]['language.saveFailed'],
          variant: 'destructive',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, user?.id, toast]);

  // Per-key English fallback — a missing translation never renders a raw key.
  const t = useCallback((key, vars) => {
    let str = RESOURCES[locale]?.[key] ?? RESOURCES[DEFAULT_LOCALE][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = String(str).replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t,
    dir: (localeById(locale) || localeById(DEFAULT_LOCALE)).direction,
    localeMeta: localeById(locale) || localeById(DEFAULT_LOCALE),
  }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}