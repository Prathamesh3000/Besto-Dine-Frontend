// "Your free trial has ended" modal for the read-only grace window.
// Opens when any API call answers 403 SUBSCRIPTION_READ_ONLY (api.js fires
// SUBSCRIPTION_READ_ONLY_EVENT) and once per session on mount when the cached
// tenant is already read-only. The owner (admin) gets "Upgrade now" → billing;
// other staff are told to ask the owner. Mounted in AdminLayout next to
// TrialBanner. Admin surfaces are English-only, so strings are plain.
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, X } from 'lucide-react'
import { SUBSCRIPTION_READ_ONLY_EVENT } from '../../utils/api'
import { useAuth } from '../../Context/AuthContext'
import { isTrialOwner, isReadOnly, lockAtOf } from '../../utils/trialLock'

const SEEN_KEY = 'bd_upgrade_modal_seen'

const readSeen = () => {
  try { return sessionStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}
const markSeen = () => {
  try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* storage blocked */ }
}

const fmt = (d) => {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString()
}

export default function UpgradeModal() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const staffUser = !!user && user.role !== 'customer' && user.role !== 'superadmin'

  // Already read-only when the layout mounts (fresh login / reload): say it
  // once per session. Decided in the initializer so no effect sets state.
  const [open, setOpen] = useState(() => {
    if (!staffUser || !isReadOnly(user) || readSeen()) return false
    markSeen()
    return true
  })
  const [detail, setDetail] = useState(null)

  // Any write answered 403 SUBSCRIPTION_READ_ONLY re-opens the modal so the
  // user learns why the save did not happen.
  useEffect(() => {
    const onReadOnly = (e) => {
      setDetail(e?.detail || null)
      setOpen(true)
      markSeen()
    }
    window.addEventListener(SUBSCRIPTION_READ_ONLY_EVENT, onReadOnly)
    return () => window.removeEventListener(SUBSCRIPTION_READ_ONLY_EVENT, onReadOnly)
  }, [])

  if (!open || !staffUser) return null

  const owner = isTrialOwner(user)
  const lockAt = fmt(detail?.lockAt) || fmt(lockAtOf(user.tenant))
  const close = () => setOpen(false)
  const goUpgrade = () => { close(); navigate('/admin/subscription') }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      data-testid="upgrade-modal"
    >
      <div className="relative w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl p-6 sm:p-8 text-center">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Lock size={26} aria-hidden="true" />
        </div>
        <h2 id="upgrade-modal-title" className="mt-5 text-[22px] font-extrabold tracking-tight text-[#101828]">
          Your free trial has ended
        </h2>
        <p className="mt-2 text-[15px] text-[#475467] leading-relaxed">
          Your data is safe. Your account is read-only{lockAt ? ` until ${lockAt}` : ''}: you can view
          everything but not add or change anything.
          {lockAt ? ` It locks completely on ${lockAt}.` : ' It locks completely once the grace period ends.'}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {owner ? (
            <button
              type="button"
              onClick={goUpgrade}
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] transition-colors"
            >
              Upgrade now
            </button>
          ) : (
            <p className="rounded-xl bg-[#FFF4E8] px-4 py-3 text-[14px] font-semibold text-[#7A3E00]">
              Ask your restaurant owner to upgrade
            </p>
          )}
          <button
            type="button"
            onClick={close}
            className="inline-flex items-center justify-center rounded-xl px-5 py-2 text-[14px] font-semibold text-[#667085] hover:text-[#101828] transition-colors"
          >
            {owner ? 'Not now' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
