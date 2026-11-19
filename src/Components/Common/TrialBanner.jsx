// Slim "Free trial: N days left - Upgrade" bar at the top of the admin
// layout. Owner (admin) only, while the tenant's trial is active or in the
// read-only grace window (never after payment or for non-trial tenants).
// Blue while more than 7 days remain, amber at <= 7, red at <= 3.
// Dismissible for the rest of the session only while more than 7 days remain.
// Read-only window: a non-dismissible "trial ended — read-only until <lockAt>"
// line in amber (red on the last day before the lock).
// Admin surfaces are English-only (see src/i18n/index.js), so strings are plain.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock4, Lock, X } from 'lucide-react'
import { useAuth } from '../../Context/AuthContext'
import { trialBannerState } from '../../utils/trialLock'

const DISMISS_KEY = 'bd_trial_banner_dismissed'

const TONES = {
  blue: 'border-sky-300 bg-sky-50 text-sky-900',
  amber: 'border-amber-300 bg-amber-100 text-amber-900',
  red: 'border-red-300 bg-red-100 text-red-800',
}

const UPGRADE_BTN = {
  blue: 'bg-sky-700 hover:bg-sky-800 text-white',
  amber: 'bg-amber-700 hover:bg-amber-800 text-white',
  red: 'bg-red-700 hover:bg-red-800 text-white',
}

const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

export default function TrialBanner({ className = 'mb-4' }) {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(readDismissed)
  const state = trialBannerState(user)

  if (!state) return null
  if (state.dismissible && dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* storage blocked */ }
  }

  const Icon = state.readOnly ? Lock : Clock4

  return (
    <div
      role="status"
      data-testid="trial-banner"
      data-tone={state.tone}
      data-read-only={state.readOnly ? 'true' : undefined}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${TONES[state.tone]} ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-semibold leading-tight">
        {state.readOnly ? state.label : <>Free trial: {state.label}</>}
      </p>
      <Link
        to="/admin/subscription"
        className={`shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition-colors ${UPGRADE_BTN[state.tone]}`}
      >
        Upgrade
      </Link>
      {state.dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss trial banner"
          className="shrink-0 rounded p-1 hover:bg-black/5"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
