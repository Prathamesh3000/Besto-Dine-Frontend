/**
 * hooks/useInstallPrompt — captures `beforeinstallprompt`, replays it from
 * install(), 14-day localStorage dismissal, standalone / iOS detection.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import useInstallPrompt, {
  INSTALL_DISMISS_KEY,
  isStandaloneDisplay,
  isIOSDevice,
} from '@/hooks/useInstallPrompt'

const DAY = 24 * 60 * 60 * 1000

/** Fire a fake beforeinstallprompt carrying a prompt()/userChoice pair. */
function fireBeforeInstall(outcome = 'accepted') {
  const evt = new Event('beforeinstallprompt', { cancelable: true })
  evt.prompt = vi.fn(() => Promise.resolve())
  evt.userChoice = Promise.resolve({ outcome })
  const preventDefault = vi.spyOn(evt, 'preventDefault')
  act(() => { window.dispatchEvent(evt) })
  return { evt, preventDefault }
}

beforeEach(() => {
  delete window.bestodine
})
afterEach(() => {
  delete window.bestodine
})

describe('useInstallPrompt', () => {
  test('idle until the browser offers to install', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    expect(result.current.dismissed).toBe(false)
    expect(result.current.isStandalone).toBe(false)
  })

  test('captures beforeinstallprompt (preventDefault) and exposes canInstall', () => {
    const { result } = renderHook(() => useInstallPrompt())
    const { preventDefault } = fireBeforeInstall()
    expect(preventDefault).toHaveBeenCalled()
    expect(result.current.canInstall).toBe(true)
  })

  test('install() replays the native prompt and resolves with the outcome', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const { evt } = fireBeforeInstall('accepted')
    let outcome
    await act(async () => { outcome = await result.current.install() })
    expect(evt.prompt).toHaveBeenCalledTimes(1)
    expect(outcome).toBe('accepted')
    // The event is single-use; once accepted the app counts as installed.
    expect(result.current.canInstall).toBe(false)
    expect(result.current.isStandalone).toBe(true)
  })

  test('install() with the prompt declined keeps the app not-installed', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireBeforeInstall('dismissed')
    let outcome
    await act(async () => { outcome = await result.current.install() })
    expect(outcome).toBe('dismissed')
    expect(result.current.isStandalone).toBe(false)
    expect(result.current.canInstall).toBe(false)
  })

  test('install() without a captured prompt returns "unavailable"', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    let outcome
    await act(async () => { outcome = await result.current.install() })
    expect(outcome).toBe('unavailable')
  })

  test('appinstalled clears the prompt and flips to standalone', () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireBeforeInstall()
    expect(result.current.canInstall).toBe(true)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current.canInstall).toBe(false)
    expect(result.current.isStandalone).toBe(true)
  })

  test('dismiss() persists for 14 days across remounts', () => {
    const now = Date.parse('2026-10-09T10:00:00Z')
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const first = renderHook(() => useInstallPrompt())
    act(() => { first.result.current.dismiss() })
    expect(first.result.current.dismissed).toBe(true)
    expect(window.localStorage.getItem(INSTALL_DISMISS_KEY)).toBe(String(now))
    first.unmount()

    // 13 days later: still dismissed.
    Date.now.mockReturnValue(now + 13 * DAY)
    expect(renderHook(() => useInstallPrompt()).result.current.dismissed).toBe(true)

    // 15 days later: the banner may come back.
    Date.now.mockReturnValue(now + 15 * DAY)
    expect(renderHook(() => useInstallPrompt()).result.current.dismissed).toBe(false)
  })

  test('garbage in localStorage is treated as "not dismissed"', () => {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, 'not-a-number')
    expect(renderHook(() => useInstallPrompt()).result.current.dismissed).toBe(false)
  })

  test('blocked storage does not crash reading or dismissing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.dismissed).toBe(false)
    act(() => { result.current.dismiss() })
    expect(result.current.dismissed).toBe(true)
  })

  test('standalone display mode hides the install offer even if the event fires', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({
      matches: q === '(display-mode: standalone)',
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.isStandalone).toBe(true)
    fireBeforeInstall()
    expect(result.current.canInstall).toBe(false)
  })

  test('inside the Electron desktop shell counts as standalone', () => {
    window.bestodine = { isDesktop: true }
    expect(isStandaloneDisplay()).toBe(true)
    expect(renderHook(() => useInstallPrompt()).result.current.isStandalone).toBe(true)
  })

  test('isIOS from the user agent (and iPadOS reporting as a Mac with touch)', () => {
    expect(isIOSDevice()).toBe(false)
    const ua = vi.spyOn(window.navigator, 'userAgent', 'get')
    ua.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')
    expect(isIOSDevice()).toBe(true)
    expect(renderHook(() => useInstallPrompt()).result.current.isIOS).toBe(true)

    ua.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    // jsdom has no maxTouchPoints at all, so define rather than spy.
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, get: () => 5 })
    try {
      expect(isIOSDevice()).toBe(true)
    } finally {
      delete window.navigator.maxTouchPoints
    }
  })

  test('removes its window listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useInstallPrompt())
    unmount()
    const names = remove.mock.calls.map((c) => c[0])
    expect(names).toContain('beforeinstallprompt')
    expect(names).toContain('appinstalled')
  })
})
