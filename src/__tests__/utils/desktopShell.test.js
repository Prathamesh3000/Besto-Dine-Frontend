/**
 * utils/desktopShell.js — accessors for the Electron preload bridge
 * (window.bestodine). Must behave in a plain browser / jsdom (no bridge),
 * inside the shell, and when `window` itself is missing.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { isDesktopShell, getDesktopShell, getDesktopRole, openDesktopSettings, openExternal } from '@/utils/desktopShell'

const BRIDGE = {
  isDesktop: true,
  version: '1.0.0',
  deviceRole: 'counter',
  serverUrl: 'https://bestodine.com',
  printAgent: { getStatus: vi.fn(), onStatus: vi.fn() },
  openSettings: vi.fn(),
  openExternal: vi.fn(),
}

function setBridge(value) {
  Object.defineProperty(window, 'bestodine', { value, configurable: true, writable: true })
}

afterEach(() => {
  delete window.bestodine
})

describe('outside the desktop shell', () => {
  test('no window.bestodine → not desktop, null bridge, null role', () => {
    expect(isDesktopShell()).toBe(false)
    expect(getDesktopShell()).toBeNull()
    expect(getDesktopRole()).toBeNull()
  })

  test('a bridge without isDesktop === true is ignored', () => {
    setBridge({ isDesktop: 'yes', deviceRole: 'kiosk' })
    expect(isDesktopShell()).toBe(false)
    expect(getDesktopRole()).toBeNull()
    setBridge(null)
    expect(isDesktopShell()).toBe(false)
  })

  test('openDesktopSettings is a no-op and reports false', () => {
    expect(openDesktopSettings()).toBe(false)
  })

  test('openExternal falls back to window.open with noopener', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(openExternal('https://example.com/help')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/help', '_blank', 'noopener,noreferrer')
  })

  test('openExternal ignores empty or non-string urls', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(openExternal('')).toBe(false)
    expect(openExternal(undefined)).toBe(false)
    expect(openExternal(42)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  test('survives a missing window (SSR / node)', () => {
    vi.stubGlobal('window', undefined)
    expect(isDesktopShell()).toBe(false)
    expect(getDesktopShell()).toBeNull()
    expect(getDesktopRole()).toBeNull()
    expect(openDesktopSettings()).toBe(false)
    expect(openExternal('https://example.com')).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('inside the desktop shell', () => {
  test('exposes the bridge and the device role', () => {
    setBridge(BRIDGE)
    expect(isDesktopShell()).toBe(true)
    expect(getDesktopShell()).toBe(BRIDGE)
    expect(getDesktopRole()).toBe('counter')
  })

  test('role falls back to null when the bridge has no deviceRole', () => {
    setBridge({ ...BRIDGE, deviceRole: '' })
    expect(isDesktopShell()).toBe(true)
    expect(getDesktopRole()).toBeNull()
  })

  test('openDesktopSettings calls bridge.openSettings', () => {
    setBridge(BRIDGE)
    expect(openDesktopSettings()).toBe(true)
    expect(BRIDGE.openSettings).toHaveBeenCalledTimes(1)
  })

  test('openExternal goes through the bridge, not window.open', () => {
    setBridge(BRIDGE)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(openExternal('https://razorpay.com')).toBe(true)
    expect(BRIDGE.openExternal).toHaveBeenCalledWith('https://razorpay.com')
    expect(open).not.toHaveBeenCalled()
  })

  test('a bridge missing openSettings / openExternal degrades gracefully', () => {
    setBridge({ isDesktop: true, deviceRole: 'kitchen' })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(openDesktopSettings()).toBe(false)
    expect(openExternal('https://example.com')).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
