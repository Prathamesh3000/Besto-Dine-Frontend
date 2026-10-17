// "A new version of BestoDine is ready" — fixed bar that appears once the
// service worker has activated a fresh deploy (see useServiceWorkerUpdate).
// Mounted from main.jsx beside <App />, outside the router, so it survives
// navigation and shows on every screen including the kitchen display.
import React, { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import useServiceWorkerUpdate from '../../hooks/useServiceWorkerUpdate'

export default function UpdateAvailableToast() {
  const { needRefresh, update } = useServiceWorkerUpdate()
  const [hidden, setHidden] = useState(false)
  const [reloading, setReloading] = useState(false)

  if (!needRefresh || hidden) return null

  const onReload = () => {
    setReloading(true)
    update()
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="update-available-toast"
      className="fixed inset-x-3 bottom-3 z-[9999] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#1A1A1A] shadow-lg"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-[#FE8301]" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-medium">A new version of BestoDine is ready</p>
      <button
        type="button"
        onClick={onReload}
        disabled={reloading}
        className="shrink-0 rounded-lg bg-[#FE8301] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#e67600] disabled:opacity-60"
      >
        {reloading ? 'Reloading…' : 'Reload'}
      </button>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Later"
        className="shrink-0 rounded-lg p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
