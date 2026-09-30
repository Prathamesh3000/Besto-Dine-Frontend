import { useEffect } from 'react';
import i18n from './index';
import { useAuth } from '../Context/AuthContext';

// Bridges the logged-in user's `preferredLanguage` field (returned by
// /auth/me and stored in AuthContext) with i18next.
//
// Two-way sync rules:
//   • On login / app load: if user.preferredLanguage is set AND differs
//     from the current i18n language, switch i18n to match the user's
//     saved choice. The user's server-side pref outranks browser
//     detection — they explicitly picked it last time.
//   • The reverse direction (Profile modal calls i18n.changeLanguage()
//     and PUTs /auth/profile) lives in Profile.jsx; this component only
//     handles the read-on-mount case.
//
// Mounted once near the root (inside <AuthProvider>) so it sees every
// auth state change without each consumer wiring this up themselves.
export default function LanguageSync() {
  const { user } = useAuth();

  useEffect(() => {
    const pref = user?.preferredLanguage;
    if (!pref) return;
    // Compare against resolvedLanguage so we don't fight the detector
    // when a region code ("en-US") was loaded as the base "en".
    if (i18n.resolvedLanguage !== pref) {
      i18n.changeLanguage(pref);
    }
  }, [user?.preferredLanguage]);

  return null;
}
