import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// The hook lazily imports 'virtual:pwa-register' only when it may register.
// Inside the desktop shell it must never import it (the shell owns offline).
const importSpy = vi.fn()
vi.mock('virtual:pwa-register', () => { importSpy(); return { registerSW: () => () => {} } })

describe('useServiceWorkerUpdate inside the desktop shell', () => {
  afterEach(() => {
    delete window.bestodine
    vi.resetModules()
    importSpy.mockClear()
  })

  it('does not register a service worker when window.bestodine.isDesktop is true', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: { controller: null }, configurable: true })
    window.bestodine = { isDesktop: true }
    const { default: useServiceWorkerUpdate } = await import('../../hooks/useServiceWorkerUpdate')
    const { result } = renderHook(() => useServiceWorkerUpdate())
    await new Promise((r) => setTimeout(r, 20))
    expect(importSpy).not.toHaveBeenCalled()
    expect(result.current.needRefresh).toBe(false)
    delete navigator.serviceWorker
  })
})
