// Where the Windows desktop app installer is downloaded from. The desktop
// build publishes `BestoDine-Setup-<version>.exe` + latest.yml to the update
// feed (desktop/package.json → build.publish.url), so the installer lives
// next to it. Override with VITE_DESKTOP_DOWNLOAD_URL (e.g. a CDN or a
// version-less "latest" redirect) and bump DESKTOP_APP_VERSION when a new
// installer is published and no override is set.
import { isDesktopShell } from './desktopShell'

const DESKTOP_APP_VERSION = '1.4.1'
const DEFAULT_FEED = 'https://updates.bestodine.com/desktop'

export const DESKTOP_DOWNLOAD_URL = (
    import.meta.env.VITE_DESKTOP_DOWNLOAD_URL
    || `${DEFAULT_FEED}/BestoDine-Setup-${DESKTOP_APP_VERSION}.exe`
)

/**
 * The installer is Windows-only, so offer it everywhere except inside the
 * desktop app itself (already installed) and on phones / tablets.
 */
export function canOfferDesktopDownload() {
    if (typeof navigator === 'undefined') return false
    if (isDesktopShell()) return false
    return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
}
