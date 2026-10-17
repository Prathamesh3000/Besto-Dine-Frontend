// PWA "Install app" state (DESKTOP_AND_PWA_PLAN.md, Part 1).
//
// Chrome / Edge / Samsung Internet fire `beforeinstallprompt` once the
// manifest + service worker qualify the page; we hold on to that event
// and replay it from a button (`install()`), which is the only way to
// show the native install dialog on demand. iOS Safari has no such event:
// the only route is Share → "Add to Home Screen", so `isIOS` lets the UI
// show that hint instead. Both are hidden once running standalone (already
// installed) or inside the Electron desktop shell, and for 14 days after
// the user dismisses the banner.
import { useCallback, useEffect, useState } from 'react'

export const INSTALL_DISMISS_KEY = 'bd_install_banner_dismissed_at'
export const INSTALL_DISMISS_DAYS = 14
const DISMISS_MS = INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000

/** True when the page runs as an installed app (or inside the desktop shell). */
export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  try {
    if (window.bestodine?.isDesktop === true) return true
    if (window.navigator?.standalone === true) return true // iOS Safari
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches === true
  } catch {
    return false
  }
}

/** iPhone / iPad (incl. iPadOS 13+ which reports as a Mac with touch). */
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
}

function readDismissed(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(INSTALL_DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return now - at < DISMISS_MS
  } catch {
    return false
  }
}

function writeDismissed(now = Date.now()) {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(now))
  } catch {
    // Private mode / blocked storage: the banner just comes back next load.
  }
}

/**
 * @returns {{
 *   canInstall: boolean,   // native prompt captured and not yet installed
 *   install: () => Promise<'accepted'|'dismissed'|'unavailable'>,
 *   isStandalone: boolean, // already running as an app
 *   isIOS: boolean,        // show the Share → Add to Home Screen hint
 *   dismissed: boolean,    // user hid the banner within the last 14 days
 *   dismiss: () => void,
 * }}
 */
export default function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [dismissed, setDismissed] = useState(() => readDismissed())
  const [isStandalone] = useState(() => isStandaloneDisplay())
  const [isIOS] = useState(() => isIOSDevice())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onBeforeInstall = (e) => {
      // Stop Chrome's own mini-infobar; we show our banner instead.
      e.preventDefault()
      setPromptEvent(e)
    }
    const onInstalled = () => {
      setPromptEvent(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!promptEvent) return 'unavailable'
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      const outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed'
      // The event is single-use either way.
      setPromptEvent(null)
      if (outcome === 'accepted') setInstalled(true)
      return outcome
    } catch {
      setPromptEvent(null)
      return 'dismissed'
    }
  }, [promptEvent])

  const dismiss = useCallback(() => {
    writeDismissed()
    setDismissed(true)
  }, [])

  return {
    canInstall: Boolean(promptEvent) && !installed && !isStandalone,
    install,
    isStandalone: isStandalone || installed,
    isIOS,
    dismissed,
    dismiss,
  }
}
