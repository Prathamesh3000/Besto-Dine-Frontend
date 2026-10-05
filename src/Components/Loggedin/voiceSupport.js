/**
 * Feature detection for voice search (Web Speech API).
 *
 * Two independent requirements:
 *  1. The browser implements SpeechRecognition (Chrome / Edge / Samsung
 *     Internet / Safari 14.5+; NOT Firefox, NOT most iOS in-app webviews).
 *  2. The page is a SECURE CONTEXT. Browsers only grant the microphone on
 *     https:// or http://localhost. Opening the app on a phone via
 *     http://192.168.x.x:5173 is NOT secure, so the mic is refused there
 *     even in Chrome — test voice search over https (see README).
 */
export function getVoiceSupport() {
    if (typeof window === 'undefined') {
        return { supported: false, reason: 'unsupported', reasonText: 'Voice search is not available here.' };
    }
    if (window.isSecureContext === false) {
        return {
            supported: false,
            reason: 'insecure',
            reasonText: 'Voice search needs a secure (https) connection — browsers block the microphone on plain http pages.',
        };
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
        return {
            supported: false,
            reason: 'unsupported',
            reasonText: "Your browser doesn't support voice search. Try Chrome, Edge or Safari.",
        };
    }
    return { supported: true, reason: null, reasonText: '' };
}

const SPEECH_LANGS = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

/** i18n language code ('en', 'hi', 'mr', 'en-US'…) → BCP-47 speech language. */
export function speechLangFor(lng) {
    const base = String(lng || 'en').toLowerCase().split('-')[0];
    return SPEECH_LANGS[base] || 'en-IN';
}
