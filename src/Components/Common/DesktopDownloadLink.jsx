// "Download desktop app" link for the Windows installer. Renders nothing
// inside the desktop app or on phones (see canOfferDesktopDownload). Styling
// comes from the caller so it fits the landing page, the footer and the
// staff login page.
import React from 'react'
import { Download } from 'lucide-react'
import { DESKTOP_DOWNLOAD_URL, canOfferDesktopDownload } from '../../utils/desktopDownload'

export default function DesktopDownloadLink({ className = '', children, icon = true, ...rest }) {
    if (!canOfferDesktopDownload()) return null
    return (
        <a
            href={DESKTOP_DOWNLOAD_URL}
            rel="noopener"
            data-testid="desktop-download-link"
            className={className}
            {...rest}
        >
            {icon && <Download className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {children}
        </a>
    )
}
