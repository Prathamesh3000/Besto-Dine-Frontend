// Slim "Free trial: N days left - Choose a plan" bar at the top of the admin
// layout. Owner (admin) only, only while tenant.status === 'trial' with a
// non-null daysLeft (so never after payment or for non-trial tenants).
// Amber at <= 3 days, red on the last day / day of expiry. Dismissible for the
// rest of the session only while more than 3 days remain.
// Admin surfaces are English-only (see src/i18n/index.js), so strings are plain.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock4, X } from 'lucide-react'
import { useAuth } from '../../Context/AuthContext'
import { trialBannerState } from '../../utils/trialLock'

const DISMISS_KEY = 'bd_trial_banner_dismissed'

const TONES = {
  info: 'border-[#FE8301]/30 bg-[#FFF4E8] text-[#7A3E00]',
  amber: 'border-amber-300 bg-amber-100 text-amber-900',
  red: 'border-red-300 bg-red-100 text-red-800',
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

  return (
    <div
      role="status"
      data-testid="trial-banner"
      data-tone={state.tone}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${TONES[state.tone]} ${className}`}
    >
      <Clock4 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-semibold leading-tight">
        Free trial: {state.label}
        {' - '}
        <Link to="/admin/subscription" className="underline underline-offset-2 hover:no-underline">
          Choose a plan
        </Link>
      </p>
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
