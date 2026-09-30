// i18n bootstrap. Imported once from main.jsx; everything else uses
// useTranslation() / t() from react-i18next without touching this file.
//
// Scope (Phase 1):
//   • Customer-facing surfaces only — Header, BottomNav, Profile,
//     EditProfile, Login, Home. Admin / Waiter / Chef stays English.
//   • Three languages: en, hi, mr.
//   • Default language picked by the browser language detector on first
//     visit (navigator.language). Override #1 = localStorage key
//     `i18nextLng` (auto-managed by the detector). Override #2 =
//     `user.preferredLanguage` from /auth/me, applied by LanguageSync
//     after login.
//
// Adding a new key: append it to en.json first, then mirror in hi.json /
// mr.json. Missing translations transparently fall back to the English
// value (fallbackLng below).

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Only English (the fallback, needed for first paint) is bundled. hi / mr
// are split into their own chunks and fetched on demand (#25) — see
// ensureLocale() below.
import en from './locales/en.json';

const LOCALE_LOADERS = {
  hi: () => import('./locales/hi.json'),
  mr: () => import('./locales/mr.json'),
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English',  nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi',    nativeLabel: 'हिन्दी'  },
  { code: 'mr', label: 'Marathi',  nativeLabel: 'मराठी'  },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    // English is the source of truth — every key exists here. Missing
    // hi/mr strings fall back to the English text so we never render
    // raw keys to the user.
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi', 'mr'],
    // Strip region codes ("hi-IN" → "hi") so locales from the browser
    // map cleanly onto our three buckets.
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    detection: {
      // Order matters: cached choice (set the last time the user picked
      // a language) wins; then navigator on first visit.
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    react: {
      // English is bundled synchronously, so there's always something to
      // render; a lazily-loaded locale re-renders consumers when its
      // bundle is added to the store.
      useSuspense: false,
      bindI18n: 'languageChanged',
      bindI18nStore: 'added',
    },
  });

const baseCode = (lng) => String(lng || '').toLowerCase().split('-')[0];
const pending = {};

/**
 * Fetch and register a non-default locale bundle. Resolves immediately
 * for English or a bundle that is already loaded. Never rejects — on a
 * network failure the UI simply stays on the English fallback.
 */
export function ensureLocale(lng) {
  const code = baseCode(lng);
  const loader = LOCALE_LOADERS[code];
  if (!loader || i18n.hasResourceBundle(code, 'translation')) return Promise.resolve();
  if (!pending[code]) {
    pending[code] = loader()
      .then((mod) => { i18n.addResourceBundle(code, 'translation', mod.default || mod, true, true); })
      .catch(() => { delete pending[code]; });
  }
  return pending[code];
}

// Every caller (Profile's language picker, LanguageSync) goes through
// changeLanguage — load the bundle first so the switch never paints
// English for a frame before the translation arrives.
const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = (lng, callback) =>
  ensureLocale(lng).then(() => originalChangeLanguage(lng, callback));

// Detected / cached language on first load (e.g. a returning Hindi user):
// English renders immediately, the Hindi chunk swaps in when it lands.
ensureLocale(i18n.language);

export default i18n;
