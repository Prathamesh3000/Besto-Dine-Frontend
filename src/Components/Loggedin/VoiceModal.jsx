import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getVoiceSupport, speechLangFor } from './voiceSupport';

/**
 * Voice search bottom sheet (Web Speech API).
 *
 * - Language follows the current i18n language (en → en-IN, hi → hi-IN,
 *   mr → mr-IN).
 * - Interim results are shown live; the FINAL result is handed to
 *   `onResult(text)` automatically (the caller puts it in the search box
 *   and runs the search) and the sheet closes.
 * - Errors are shown as a message — never as the transcript, so the
 *   "Search" button can't end up searching for "Microphone access denied".
 * - The Header only opens this when getVoiceSupport().supported; the
 *   unsupported / insecure-context branches below are a safety net.
 */
const VoiceModal = ({ onClose, onResult }) => {
  const { t, i18n } = useTranslation();
  const support = getVoiceSupport();
  const lang = speechLangFor(i18n.resolvedLanguage || i18n.language);

  const [status, setStatus] = useState(support.supported ? 'idle' : 'unsupported'); // idle | listening | error | unsupported
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const recognitionRef = useRef(null);
  const deliveredRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onResultRef.current = onResult; onCloseRef.current = onClose; }, [onResult, onClose]);

  const deliver = useCallback((text) => {
    const clean = String(text || '').trim();
    if (!clean || deliveredRef.current) return;
    deliveredRef.current = true;
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    onResultRef.current?.(clean);
    onCloseRef.current?.();
  }, []);

  useEffect(() => {
    if (!support.supported) return undefined;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => { setStatus('listening'); setMessage(''); };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      setTranscript((final || interim).trim());
      if (final.trim()) deliver(final);
    };

    recognition.onerror = (event) => {
      switch (event.error) {
        case 'aborted':
          return; // we stopped it ourselves
        case 'no-speech':
          setStatus('idle');
          setMessage(t('voice.no_speech', "Didn't catch that. Tap the mic and try again."));
          return;
        case 'not-allowed':
        case 'service-not-allowed':
          setStatus('error');
          setMessage(t('voice.not_allowed',
            'Microphone permission is blocked. Allow microphone access for this site in your browser settings (tap the lock / ⓘ icon in the address bar), then try again.'));
          return;
        case 'audio-capture':
          setStatus('error');
          setMessage(t('voice.no_mic', 'No microphone was found. Check that one is connected and not used by another app.'));
          return;
        case 'network':
          setStatus('error');
          setMessage(t('voice.network', 'Voice search needs an internet connection — your browser sends the audio to its speech service. Check your connection and try again.'));
          return;
        case 'language-not-supported':
          setStatus('error');
          setMessage(t('voice.lang', 'Voice search is not available in this language on your browser. Switch the app language to English and try again.'));
          return;
        default:
          setStatus('error');
          setMessage(t('voice.generic', 'Voice search stopped unexpectedly. Tap the mic to try again.'));
      }
    };

    recognition.onend = () => {
      setStatus((prev) => (prev === 'listening' ? 'idle' : prev));
    };

    // Auto-start on open (the tap that opened the sheet is the user gesture).
    try { recognition.start(); } catch { /* already started */ }

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, support.supported]);

  const handleMicClick = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (status === 'listening') {
      try { rec.stop(); } catch { /* ignore */ }
      return;
    }
    setTranscript('');
    setMessage('');
    try {
      rec.start();
    } catch {
      try { rec.abort(); } catch { /* ignore */ }
      setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 150);
    }
  };

  const heading = status === 'listening'
    ? t('voice.listening', 'Listening…')
    : status === 'error'
      ? t('voice.error_title', "Voice search couldn't start")
      : t('voice.tap_to_speak', 'Tap the mic to speak');

  return (
    <div className="fixed inset-0 z-[999] bg-black/80 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t('voice.title', 'Voice search')}>
      <div className="relative w-full">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="absolute -top-[60px] right-4 w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center shadow-lg"
        >
          <i className="fi fi-br-cross text-sm text-[#333]" />
        </button>

        {/* Bottom Sheet */}
        <div className="w-full bg-white px-4 pt-6 pb-10">
          {status === 'unsupported' ? (
            <div className="text-center">
              <p className="text-[#101828] text-[18px] font-semibold nunito mb-2">
                {t('voice.unavailable', 'Voice search unavailable')}
              </p>
              <p className="text-[#645E66] text-[14px] varela-rounded">{support.reasonText}</p>
            </div>
          ) : (
            <>
              <p className="text-center nunito text-[#101828] text-[18px] font-semibold" aria-live="polite">
                {heading}
              </p>

              {transcript && (
                <p className="text-center text-[#1A181B] text-[15px] varela-rounded mt-2 px-4 min-h-[20px]" aria-live="polite">
                  "{transcript}"
                </p>
              )}
              {message && (
                <p role="alert" className="text-center text-[#B42318] text-[13px] varela-rounded mt-2 px-4">
                  {message}
                </p>
              )}

              {/* Mic animation */}
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={handleMicClick}
                  aria-label={status === 'listening' ? t('voice.stop', 'Stop listening') : t('voice.start', 'Start listening')}
                  className="relative w-36 h-36 flex items-center justify-center"
                >
                  {status === 'listening' && (
                    <>
                      <div className="absolute w-36 h-36 rounded-full bg-[#FFD9A0] animate-ping" style={{ animationDuration: '1.5s' }} />
                      <div className="absolute w-28 h-28 rounded-full bg-[#FFB547] animate-ping" style={{ animationDuration: '2s' }} />
                    </>
                  )}
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center z-10 shadow-xl transition-colors ${
                    status === 'listening' ? 'bg-[#FF9B0B]' : 'bg-gray-300'
                  }`}>
                    <Mic size={24} className={status === 'listening' ? 'text-white' : 'text-gray-600'} />
                  </div>
                </button>
              </div>

              {/* Manual submit — e.g. the browser ended without a final result */}
              {transcript && status !== 'listening' && (
                <div className="mt-6 px-4">
                  <button
                    type="button"
                    onClick={() => deliver(transcript)}
                    className="w-full bg-[#FE8301] text-white py-3 rounded-xl font-semibold nunito text-[14px] active:scale-[0.98] transition-transform"
                  >
                    {t('voice.search_for', 'Search')} "{transcript.length > 30 ? transcript.slice(0, 30) + '…' : transcript}"
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceModal;
