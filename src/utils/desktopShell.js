/**
 * Thin, React-free accessors for the Electron desktop shell bridge
 * (`window.bestodine`, exposed by desktop/ preload — see
 * DESKTOP_AND_PWA_PLAN.md, Part 2 "Preload contract").
 *
 *   {
 *     isDesktop: true, version, deviceRole: 'counter'|'kitchen'|'kiosk'|'waiter', serverUrl,
 *     printAgent: { getStatus(): Promise<status>, onStatus(cb): unsubscribe },
 *     openSettings(): void, openExternal(url): void
 *   }
 *
 * Every helper is safe to call where `window` is missing (SSR / node) or
 * where the bridge is absent (plain browser, jsdom) — it simply reports
 * "not in the shell" and falls back to browser behaviour.
 */

const getWindow = () => (typeof window === 'undefined' ? null : window)

/** The preload bridge object, or null outside the desktop app. */
export function getDesktopShell() {
    const w = getWindow()
    const bridge = w && w.bestodine
    return bridge && typeof bridge === 'object' && bridge.isDesktop === true ? bridge : null
}

/** True only when running inside the BestoDine desktop (Electron) app. */
export function isDesktopShell() {
    return getDesktopShell() !== null
}

/** 'counter' | 'kitchen' | 'kiosk' | 'waiter', or null in a browser. */
export function getDesktopRole() {
    const bridge = getDesktopShell()
    return bridge && typeof bridge.deviceRole === 'string' && bridge.deviceRole ? bridge.deviceRole : null
}

/** Opens the shell's first-run / settings window. No-op outside the shell. */
export function openDesktopSettings() {
    const bridge = getDesktopShell()
    if (bridge && typeof bridge.openSettings === 'function') {
        bridge.openSettings()
        return true
    }
    return false
}

/**
 * Opens a URL in the system browser when in the shell, otherwise in a new
 * browser tab (noopener). Ignores empty / non-string URLs.
 */
export function openExternal(url) {
    if (typeof url !== 'string' || !url) return false
    const bridge = getDesktopShell()
    if (bridge && typeof bridge.openExternal === 'function') {
        bridge.openExternal(url)
        return true
    }
    const w = getWindow()
    if (w && typeof w.open === 'function') {
        w.open(url, '_blank', 'noopener,noreferrer')
        return true
    }
    return false
}
