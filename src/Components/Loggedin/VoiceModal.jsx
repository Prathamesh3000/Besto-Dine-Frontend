import React, { useState, useEffect, useRef } from "react";
import { Mic } from 'lucide-react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const VoiceModal = ({ onClose, onResult }) => {
  const [status, setStatus] = useState('idle'); // idle | listening | processing | error | unsupported
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!SpeechRecognition) {
      setStatus('unsupported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setStatus('listening');

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(final || interim);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        setStatus('idle');
        setTranscript('No speech detected. Tap mic to try again.');
      } else if (event.error === 'not-allowed') {
        setStatus('error');
        setTranscript('Microphone access denied. Please allow microphone access.');
      } else {
        setStatus('error');
        setTranscript('Something went wrong. Tap mic to try again.');
      }
    };

    recognition.onend = () => {
      setStatus((prev) => prev === 'listening' ? 'idle' : prev);
    };

    // Auto-start on mount
    try {
      recognition.start();
    } catch {
      // Already started
    }

    return () => {
      try { recognition.abort(); } catch {}
    };
  }, []);

  const handleMicClick = () => {
    if (!recognitionRef.current) return;

    if (status === 'listening') {
      recognitionRef.current.stop();
      setStatus('idle');
    } else {
      setTranscript('');
      try {
        recognitionRef.current.start();
      } catch {
        // Restart if already running
        recognitionRef.current.abort();
        setTimeout(() => {
          try { recognitionRef.current.start(); } catch {}
        }, 100);
      }
    }
  };

  const handleSubmit = () => {
    if (transcript.trim() && onResult) {
      onResult(transcript.trim());
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black/80 flex items-end justify-center">
      <div className="relative w-full">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-[60px] right-4 w-10 h-10 rounded-full bg-[#F7F7F7] flex items-center justify-center shadow-lg"
        >
          <i className="fi fi-br-cross text-sm text-[#333]" />
        </button>

        {/* Bottom Sheet */}
        <div className="w-full bg-white px-4 pt-6 pb-10">
          {status === 'unsupported' ? (
            <div className="text-center">
              <p className="text-[#101828] text-[18px] font-semibold nunito mb-2">
                Voice Search Unavailable
              </p>
              <p className="text-[#645E66] text-[14px] varela-rounded">
                Your browser doesn't support voice recognition. Try Chrome or Edge.
              </p>
            </div>
          ) : (
            <>
              <p className="text-center nunito text-[#101828] text-[18px] font-semibold">
                {status === 'listening' ? 'Listening...' : status === 'error' ? 'Error' : 'Tap mic to speak'}
              </p>

              {transcript && (
                <p className="text-center text-[#645E66] text-[14px] varela-rounded mt-2 px-4 min-h-[20px]">
                  "{transcript}"
                </p>
              )}

              {/* Mic animation */}
              <div className="flex justify-center mt-8">
                <button
                  onClick={handleMicClick}
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

              {/* Submit button when transcript exists */}
              {transcript.trim() && status !== 'listening' && (
                <div className="mt-6 px-4">
                  <button
                    onClick={handleSubmit}
                    className="w-full bg-[#FE8301] text-white py-3 rounded-xl font-semibold nunito text-[14px] active:scale-[0.98] transition-transform"
                  >
                    Search "{transcript.length > 30 ? transcript.slice(0, 30) + '...' : transcript}"
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
