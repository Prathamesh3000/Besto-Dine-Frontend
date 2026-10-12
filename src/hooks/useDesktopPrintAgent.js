import { useEffect, useState } from 'react'
import { getDesktopShell } from '../utils/desktopShell'

/**
 * Live status of the print agent embedded in the desktop app.
 *
 * Returns `{ inDesktop, status }`:
 *   - inDesktop: true only inside the Electron shell (window.bestodine.isDesktop)
 *   - status:    the preload contract object
 *                { state: 'disabled'|'connecting'|'connected'|'error'|'revoked',
 *                  printers: [{ name, ok }], lastJobAt, error }
 *                or null while loading / outside the shell / when the bridge
 *                has no printAgent (older shell build).
 *
 * Reads `printAgent.getStatus()` once on mount and then follows
 * `printAgent.onStatus(cb)`; the unsubscribe it returns is called on unmount.
 */
export default function useDesktopPrintAgent() {
    const bridge = getDesktopShell()
    const inDesktop = bridge !== null
    const printAgent = inDesktop && bridge.printAgent && typeof bridge.printAgent === 'object' ? bridge.printAgent : null
    const [status, setStatus] = useState(null)

    useEffect(() => {
        if (!printAgent) return undefined
        let active = true
        const apply = (next) => { if (active) setStatus(next && typeof next === 'object' ? next : null) }

        if (typeof printAgent.getStatus === 'function') {
            try {
                Promise.resolve(printAgent.getStatus()).then(apply, () => { /* keep whatever onStatus sends */ })
            } catch { /* bridge threw synchronously — ignore */ }
        }

        let unsubscribe = null
        if (typeof printAgent.onStatus === 'function') {
            try { unsubscribe = printAgent.onStatus(apply) } catch { unsubscribe = null }
        }

        return () => {
            active = false
            if (typeof unsubscribe === 'function') {
                try { unsubscribe() } catch { /* ignore */ }
            }
        }
    }, [printAgent])

    return { inDesktop, status }
}
