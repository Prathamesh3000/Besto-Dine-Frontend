import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, X } from 'lucide-react';

// ExitConfirmModal
// ───────────────────────────────────────────────────────────────────────
// Centred dialog on tablet/desktop, bottom-sheet on phones. Mirrors the
// modal language used elsewhere in the customer flow (Diet / Language
// pickers in Profile.jsx) — orange brand, slide-up animation, blurred
// backdrop, close-on-backdrop-click — so this doesn't feel like a
// bolted-on system dialog.
//
// Driven entirely by props from useExitConfirmation. This component
// owns no history / popstate logic; it's pure presentation.
export default function ExitConfirmModal({ open, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const stayBtnRef = useRef(null);

  // Lock the page scroll while the sheet is up so swiping the dimmed
  // background doesn't move what's behind it. Cleans up on unmount /
  // close. Also auto-focuses Stay so an Enter / Space press defaults
  // to the safer choice.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Defer focus so the slide-in animation isn't fighting the focus
    // ring jump.
    const id = setTimeout(() => { stayBtnRef.current?.focus(); }, 50);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(id);
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — tap to cancel (same as picking Stay) */}
      <div
        className="fixed inset-0 bg-black/55 z-[60] transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-modal-title"
        aria-describedby="exit-modal-body"
        className="fixed left-0 right-0 bottom-0 z-[61]
                   md:top-1/2 md:left-1/2 md:bottom-auto
                   md:-translate-x-1/2 md:-translate-y-1/2
                   md:max-w-sm md:w-[90%]
                   bg-white rounded-t-3xl md:rounded-2xl
                   shadow-2xl
                   p-6 pt-7
                   animate-slideUp md:animate-none
                   font-nunito"
      >
        {/* Close icon — same as the Diet/Language sheets, positioned
            outside the sheet on mobile and inside on desktop. */}
        <button
          onClick={onCancel}
          aria-label={t('common.cancel')}
          className="absolute -top-14 md:top-4 right-4 md:right-4 p-2 bg-white md:bg-gray-100/60 rounded-full shadow-lg md:shadow-none active:scale-95 transition-transform"
        >
          <X size={22} className="text-[#1A181B]" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Brand-orange icon ring */}
          <div className="w-14 h-14 rounded-full bg-[#FFF4E8] flex items-center justify-center mb-3">
            <LogOut size={26} className="text-[#FE8301]" />
          </div>

          <h2 id="exit-modal-title" className="text-[20px] font-bold text-[#1A181B] mb-1.5">
            {t('exit_modal.title')}
          </h2>
          <p id="exit-modal-body" className="text-[14px] text-[#645E66] font-varela leading-snug max-w-[280px]">
            {t('exit_modal.body')}
          </p>
        </div>

        {/* Actions — primary "Stay" on the right per platform convention
            (the safer choice gets prominence; user has to deliberately
            pick the destructive option). */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 h-12 rounded-xl border border-[#EEEEEE] text-[14px] font-semibold text-[#1A181B] font-varela hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            {t('exit_modal.exit')}
          </button>
          <button
            ref={stayBtnRef}
            onClick={onCancel}
            className="flex-1 h-12 rounded-xl bg-[#FE8301] text-white text-[14px] font-semibold active:scale-[0.98] transition-all shadow-sm hover:bg-[#E97200]"
          >
            {t('exit_modal.stay')}
          </button>
        </div>
      </div>
    </>
  );
}
