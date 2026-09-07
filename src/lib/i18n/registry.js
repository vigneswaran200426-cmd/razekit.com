// ─────────────────────────────────────────────────────────────────────────────
// Razekit LocaleRegistry — the single source of truth for every language the
// platform can display. The selector, the provider and the preference model
// all read from here; nothing in the app may hard-code a language list.
// Adding a language = adding one entry (plus translations, when available).
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_LOCALE = 'en';

// translationStatus: 'complete'  — fully localized UI
//                    'partial'    — key surfaces localized, rest falls back to English
//                    'fallback'   — selectable, UI falls back to English until resources land
export const LOCALES = [
  { locale: 'en',    nativeName: 'English',   englishName: 'English',    direction: 'ltr', enabled: true, popular: true,  translationStatus: 'complete' },
  { locale: 'hi-IN', nativeName: 'हिन्दी',      englishName: 'Hindi',      direction: 'ltr', enabled: true, popular: true,  translationStatus: 'partial' },
  { locale: 'ta-IN', nativeName: 'தமிழ்',      englishName: 'Tamil',      direction: 'ltr', enabled: true, popular: true,  translationStatus: 'partial' },
  { locale: 'te-IN', nativeName: 'తెలుగు',     englishName: 'Telugu',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'partial' },
  { locale: 'ml-IN', nativeName: 'മലയാളം',    englishName: 'Malayalam',  direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'kn-IN', nativeName: 'ಕನ್ನಡ',      englishName: 'Kannada',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'bn-IN', nativeName: 'বাংলা',      englishName: 'Bengali',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'mr-IN', nativeName: 'मराठी',      englishName: 'Marathi',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'gu-IN', nativeName: 'ગુજરાતી',    englishName: 'Gujarati',    direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'pa-IN', nativeName: 'ਪੰਜਾਬੀ',      englishName: 'Punjabi',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'es-ES', nativeName: 'Español',   englishName: 'Spanish',    direction: 'ltr', enabled: true, popular: true,  translationStatus: 'partial' },
  { locale: 'fr-FR', nativeName: 'Français',  englishName: 'French',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'de-DE', nativeName: 'Deutsch',   englishName: 'German',     direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'it-IT', nativeName: 'Italiano',  englishName: 'Italian',    direction: 'ltr', enabled: true, popular: false, translationStatus: 'fallback' },
  { locale: 'pt-BR', nativeName: 'Português', englishName: 'Portuguese', direction: 'ltr', enabled: true, popular: false, translationStatus: 'fallback' },
  { locale: 'ar',    nativeName: 'العربية',    englishName: 'Arabic',     direction: 'rtl', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'ja-JP', nativeName: '日本語',     englishName: 'Japanese',   direction: 'ltr', enabled: true, popular: true,  translationStatus: 'fallback' },
  { locale: 'ko-KR', nativeName: '한국어',     englishName: 'Korean',     direction: 'ltr', enabled: true, popular: false, translationStatus: 'fallback' },
  { locale: 'zh-CN', nativeName: '中文',       englishName: 'Chinese',    direction: 'ltr', enabled: true, popular: false, translationStatus: 'fallback' },
  { locale: 'ur-PK', nativeName: 'اردو',       englishName: 'Urdu',       direction: 'rtl', enabled: true, popular: false, translationStatus: 'fallback' },
  { locale: 'he-IL', nativeName: 'עברית',      englishName: 'Hebrew',     direction: 'rtl', enabled: true, popular: false, translationStatus: 'fallback' },
];

export function localeById(id) {
  return LOCALES.find((l) => l.locale === id) || null;
}

// Resolve a loose id ('ta', 'ta-IN', 'ta_in') to a registry entry — used for
// stored preferences, account preferences and browser locale detection.
export function resolveLocale(id) {
  if (!id) return null;
  const norm = String(id).replace('_', '-');
  return localeById(norm) || LOCALES.find((l) => l.locale.split('-')[0] === norm.split('-')[0]) || null;
}

// Search matches native name, English name and the locale code itself —
// 'Tamil', 'தமிழ்' and 'ta' all find Tamil.
export function searchLocales(query) {
  const q = (query || '').trim().toLowerCase();
  const enabled = LOCALES.filter((l) => l.enabled !== false);
  if (!q) return enabled;
  return enabled.filter((l) =>
    l.nativeName.toLowerCase().includes(q) ||
    l.englishName.toLowerCase().includes(q) ||
    l.locale.toLowerCase().includes(q) ||
    l.locale.split('-')[0] === q
  );
}