/**
 * hooks/useServiceWorkerUpdate + Components/Common/UpdateAvailableToast.
 *
 * The hook lazily imports vite-plugin-pwa's virtual `virtual:pwa-register`
 * module (mocked here) only when navigator.serviceWorker exists; jsdom has
 * none, so each test opts in by stubbing it.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor, render, screen, fireEvent } from '@testing-library/react'

const sw = vi.hoisted(() => ({
  registerSW: vi.fn(),
  options: null,
  updateServiceWorker: vi.fn(() => Promise.resolve()),
}))
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts) => {
    sw.options = opts
    sw.registerSW(opts)
    return sw.updateServiceWorker
  },
}))

import useServiceWorkerUpdate from '@/hooks/useServiceWorkerUpdate'
import UpdateAvailableToast from '@/Components/Common/UpdateAvailableToast'

function enableServiceWorker() {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(), addEventListener() {}, removeEventListener() {} },
  })
}

beforeEach(() => {
  sw.registerSW.mockClear()
  sw.updateServiceWorker.mockClear()
  sw.options = null
})
afterEach(() => {
  delete window.navigator.serviceWorker
})

describe('useServiceWorkerUpdate', () => {
  test('does nothing where service workers are unsupported (jsdom default)', async () => {
    const { result } = renderHook(() => useServiceWorkerUpdate())
    expect(result.current.needRefresh).toBe(false)
    // Give any stray dynamic import a tick to settle.
    await act(async () => {})
    expect(sw.registerSW).not.toHaveBeenCalled()
  })

  test('registers immediately and flips needRefresh when a new worker takes over', async () => {
    enableServiceWorker()
    const { result } = renderHook(() => useServiceWorkerUpdate())
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalledTimes(1))
    expect(sw.options.immediate).toBe(true)
    expect(result.current.needRefresh).toBe(false)

    act(() => { sw.options.onNeedReload() })
    expect(result.current.needRefresh).toBe(true)
  })

  test('prompt-mode onNeedRefresh also surfaces the update', async () => {
    enableServiceWorker()
    const { result } = renderHook(() => useServiceWorkerUpdate())
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalled())
    act(() => { sw.options.onNeedRefresh() })
    expect(result.current.needRefresh).toBe(true)
  })

  test('update() asks the worker to take over, then reloads the page', async () => {
    enableServiceWorker()
    const reload = vi.fn()
    const { result } = renderHook(() => useServiceWorkerUpdate({ reload }))
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalled())
    await act(async () => { await result.current.update() })
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  test('update() still reloads when the worker update call throws', async () => {
    enableServiceWorker()
    sw.updateServiceWorker.mockImplementationOnce(() => Promise.reject(new Error('boom')))
    const reload = vi.fn()
    const { result } = renderHook(() => useServiceWorkerUpdate({ reload }))
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalled())
    await act(async () => { await result.current.update() })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  test('ignores a late onNeedReload after unmount', async () => {
    enableServiceWorker()
    const { unmount } = renderHook(() => useServiceWorkerUpdate())
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalled())
    unmount()
    // Must not throw / warn about state updates on an unmounted component.
    expect(() => sw.options.onNeedReload()).not.toThrow()
  })
})

describe('UpdateAvailableToast', () => {
  const toast = () => screen.queryByTestId('update-available-toast')

  /** Mount with a service worker present and simulate a new deploy taking over. */
  async function renderWithUpdate() {
    enableServiceWorker()
    render(<UpdateAvailableToast />)
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalled())
    act(() => { sw.options.onNeedReload() })
  }

  test('renders nothing while no update is pending', async () => {
    enableServiceWorker()
    render(<UpdateAvailableToast />)
    await waitFor(() => expect(sw.registerSW).toHaveBeenCalled())
    expect(toast()).toBeNull()
  })

  test('shows the message once the worker updates; Reload hands over and reloads', async () => {
    // jsdom's location.reload is "not implemented" and logs via console.error.
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderWithUpdate()
    expect(screen.getByText('A new version of BestoDine is ready')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    })
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'Reloading…' })).toBeDisabled()
    silence.mockRestore()
  })

  test('"Later" hides the toast for this page view', async () => {
    await renderWithUpdate()
    expect(toast()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(toast()).toBeNull()
  })
})
