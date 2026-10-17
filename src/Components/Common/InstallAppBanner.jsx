// Compact "Install BestoDine on this device" bar shown on the staff login
// page and the Admin / Waiter / Chef screens. Renders nothing when the app
// is already installed (standalone / desktop shell), when the browser
// cannot install it, or for 14 days after the user dismisses it.
// Admin / Waiter / Chef surfaces are English-only (see src/i18n/index.js),
// so the strings are plain.
import React from 'react'
import { Download, Share, X } from 'lucide-react'
import useInstallPrompt from '../../hooks/useInstallPrompt'

export default function InstallAppBanner({ className = '' }) {
  const { canInstall, install, isStandalone, isIOS, dismissed, dismiss } = useInstallPrompt()

  if (isStandalone || dismissed) return null
  if (!canInstall && !isIOS) return null

  return (
    <div
      role="region"
      aria-label="Install BestoDine"
      data-testid="install-app-banner"
      className={`flex items-center gap-3 rounded-xl border border-[#FE8301]/30 bg-[#FFF4E8] px-3 py-2 text-sm text-[#1A1A1A] ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FE8301] text-white">
        <Download className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">Install BestoDine on this device</p>
        {isIOS && !canInstall ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
            Tap <Share className="inline h-3.5 w-3.5" aria-hidden="true" /> Share, then
            <span className="font-medium">&ldquo;Add to Home Screen&rdquo;</span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-gray-600">Opens full screen, launches from your home screen.</p>
        )}
      </div>
      {canInstall && (
        <button
          type="button"
          onClick={() => { install() }}
          className="shrink-0 rounded-lg bg-[#FE8301] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#e67600]"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="shrink-0 rounded-lg p-1 text-gray-500 transition hover:bg-[#FE8301]/10 hover:text-gray-800"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
