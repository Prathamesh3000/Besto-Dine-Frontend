import React from 'react'
import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DesktopDownloadLink from '../../Components/Common/DesktopDownloadLink'
import { DESKTOP_DOWNLOAD_URL } from '../../utils/desktopDownload'

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36'

const setUA = (ua) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.bestodine
})

describe('DesktopDownloadLink', () => {
  test('links to the Windows installer on a desktop browser', () => {
    setUA(DESKTOP_UA)
    render(<DesktopDownloadLink>Download desktop app</DesktopDownloadLink>)
    const link = screen.getByTestId('desktop-download-link')
    expect(link.getAttribute('href')).toBe(DESKTOP_DOWNLOAD_URL)
    expect(DESKTOP_DOWNLOAD_URL).toMatch(/BestoDine-Setup-\d+\.\d+\.\d+\.exe$/)
    expect(link.textContent).toContain('Download desktop app')
  })

  test('is hidden on a phone', () => {
    setUA(PHONE_UA)
    render(<DesktopDownloadLink>Download desktop app</DesktopDownloadLink>)
    expect(screen.queryByTestId('desktop-download-link')).toBeNull()
  })

  test('is hidden inside the desktop app', () => {
    setUA(DESKTOP_UA)
    window.bestodine = { isDesktop: true }
    render(<DesktopDownloadLink>Download desktop app</DesktopDownloadLink>)
    expect(screen.queryByTestId('desktop-download-link')).toBeNull()
  })
})
