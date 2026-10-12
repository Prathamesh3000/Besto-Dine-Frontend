/**
 * Components/Common/InstallAppBanner — the compact "Install BestoDine on
 * this device" bar. Visibility rules + Install / dismiss wiring.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

import InstallAppBanner from '@/Components/Common/InstallAppBanner'
import { INSTALL_DISMISS_KEY } from '@/hooks/useInstallPrompt'

function fireBeforeInstall(outcome = 'accepted') {
  const evt = new Event('beforeinstallprompt', { cancelable: true })
  evt.prompt = vi.fn(() => Promise.resolve())
  evt.userChoice = Promise.resolve({ outcome })
  act(() => { window.dispatchEvent(evt) })
  return evt
}

const banner = () => screen.queryByTestId('install-app-banner')

afterEach(() => {
  delete window.bestodine
})

describe('InstallAppBanner', () => {
  test('renders nothing until the browser can install', () => {
    render(<InstallAppBanner />)
    expect(banner()).toBeNull()
  })

  test('shows the bar with an Install button once beforeinstallprompt fires', () => {
    render(<InstallAppBanner />)
    fireBeforeInstall()
    expect(banner()).toBeInTheDocument()
    expect(screen.getByText('Install BestoDine on this device')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
  })

  test('Install button triggers the native prompt and the bar goes away', async () => {
    render(<InstallAppBanner />)
    const evt = fireBeforeInstall('accepted')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    })
    expect(evt.prompt).toHaveBeenCalledTimes(1)
    expect(banner()).toBeNull()
  })

  test('hidden when already running standalone', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({
      matches: q === '(display-mode: standalone)',
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }))
    render(<InstallAppBanner />)
    fireBeforeInstall()
    expect(banner()).toBeNull()
  })

  test('hidden inside the Electron desktop shell', () => {
    window.bestodine = { isDesktop: true }
    render(<InstallAppBanner />)
    fireBeforeInstall()
    expect(banner()).toBeNull()
  })

  test('dismiss hides it now and on the next render (persisted in localStorage)', () => {
    const { unmount } = render(<InstallAppBanner />)
    fireBeforeInstall()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install banner' }))
    expect(banner()).toBeNull()
    expect(window.localStorage.getItem(INSTALL_DISMISS_KEY)).toMatch(/^\d+$/)
    unmount()

    render(<InstallAppBanner />)
    fireBeforeInstall()
    expect(banner()).toBeNull()
  })

  test('iOS shows the Share → Add to Home Screen hint and no Install button', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')
    render(<InstallAppBanner />)
    expect(banner()).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    // Still dismissible.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install banner' }))
    expect(banner()).toBeNull()
  })

  test('passes className through to the wrapper', () => {
    render(<InstallAppBanner className="mb-4" />)
    fireBeforeInstall()
    expect(banner()).toHaveClass('mb-4')
  })
})
