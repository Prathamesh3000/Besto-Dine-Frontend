import React, { useState } from "react";
import { Mic } from "lucide-react";
import { toast } from "react-hot-toast";
import VoiceModal from "./VoiceModal";
import { getVoiceSupport } from "./voiceSupport";

/**
 * Mic button for a search box: opens the voice-search sheet and hands the
 * recognised text to `onResult` (the caller sets its search query, which
 * runs the search). When voice search can't work here (no
 * SpeechRecognition, or a non-secure http page such as a phone on
 * http://192.168.x.x) the mic is shown greyed out with a tooltip, and a
 * tap explains why instead of silently doing nothing.
 */
export default function VoiceSearchButton({ onResult, size = 20, className = "" }) {
  const [open, setOpen] = useState(false);
  const [support] = useState(getVoiceSupport);

  return (
    <>
      <button
        type="button"
        aria-label={support.supported ? "Search by voice" : `Voice search unavailable: ${support.reasonText}`}
        aria-disabled={!support.supported}
        title={support.supported ? "Search by voice" : support.reasonText}
        onClick={(e) => {
          e.stopPropagation();
          if (!support.supported) {
            toast(support.reasonText, { id: "voice-unavailable", icon: "🎤" });
            return;
          }
          setOpen(true);
        }}
        className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-colors touch-manipulation ${
          support.supported
            ? "text-[#645E66] hover:bg-[#E9E9EE] hover:text-[#1A181B]"
            : "text-[#C4C0C5] cursor-not-allowed"
        } ${className}`}
      >
        <Mic size={size} />
      </button>
      {open && (
        <VoiceModal
          onClose={() => setOpen(false)}
          onResult={(text) => onResult?.(text)}
        />
      )}
    </>
  );
}
