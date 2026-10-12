/**
 * hooks/useDesktopPrintAgent — follows window.bestodine.printAgent
 * (getStatus once + onStatus subscription, unsubscribed on unmount).
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useDesktopPrintAgent from '@/hooks/useDesktopPrintAgent'

const CONNECTED = { state: 'connected', printers: [{ name: 'Kitchen', ok: true }], lastJobAt: '2026-10-09T10:00:00.000Z', error: null }

function setBridge(value) {
  Object.defineProperty(window, 'bestodine', { value, configurable: true, writable: true })
}

function makeAgent(initial = CONNECTED) {
  const listeners = new Set()
  const unsubscribe = vi.fn()
  const printAgent = {
    getStatus: vi.fn().mockResolvedValue(initial),
    onStatus: vi.fn((cb) => { listeners.add(cb); return unsubscribe }),
  }
  return { printAgent, emit: (s) => listeners.forEach((cb) => cb(s)), unsubscribe }
}

afterEach(() => { delete window.bestodine })

describe('useDesktopPrintAgent', () => {
  test('outside the shell: inDesktop false, status null, nothing called', () => {
    const { result } = renderHook(() => useDesktopPrintAgent())
    expect(result.current).toEqual({ inDesktop: false, status: null })
  })

  test('inside the shell: reads getStatus once and exposes it', async () => {
    const { printAgent } = makeAgent()
    setBridge({ isDesktop: true, deviceRole: 'counter', printAgent })
    const { result, rerender } = renderHook(() => useDesktopPrintAgent())
    expect(result.current.inDesktop).toBe(true)
    await waitFor(() => expect(result.current.status).toEqual(CONNECTED))
    rerender()
    expect(printAgent.getStatus).toHaveBeenCalledTimes(1)
    expect(printAgent.onStatus).toHaveBeenCalledTimes(1)
  })

  test('follows onStatus pushes and unsubscribes on unmount', async () => {
    const { printAgent, emit, unsubscribe } = makeAgent()
    setBridge({ isDesktop: true, deviceRole: 'counter', printAgent })
    const { result, unmount } = renderHook(() => useDesktopPrintAgent())
    await waitFor(() => expect(result.current.status?.state).toBe('connected'))

    act(() => emit({ state: 'error', printers: [{ name: 'Kitchen', ok: false }], lastJobAt: null, error: 'ECONNREFUSED 192.168.1.50:9100' }))
    expect(result.current.status.state).toBe('error')
    expect(result.current.status.error).toMatch(/ECONNREFUSED/)

    act(() => emit({ state: 'revoked', printers: [], lastJobAt: null, error: 'Agent key revoked' }))
    expect(result.current.status.state).toBe('revoked')

    expect(unsubscribe).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  test('tolerates a bridge without printAgent', () => {
    setBridge({ isDesktop: true, deviceRole: 'kiosk', openSettings: vi.fn() })
    const { result, unmount } = renderHook(() => useDesktopPrintAgent())
    expect(result.current).toEqual({ inDesktop: true, status: null })
    expect(() => unmount()).not.toThrow()
  })

  test('tolerates a rejected getStatus and a printAgent without onStatus', async () => {
    const printAgent = { getStatus: vi.fn().mockRejectedValue(new Error('ipc down')) }
    setBridge({ isDesktop: true, deviceRole: 'counter', printAgent })
    const { result, unmount } = renderHook(() => useDesktopPrintAgent())
    await waitFor(() => expect(printAgent.getStatus).toHaveBeenCalledTimes(1))
    await act(async () => { await Promise.resolve() })
    expect(result.current).toEqual({ inDesktop: true, status: null })
    expect(() => unmount()).not.toThrow()
  })

  test('ignores a late getStatus result after unmount (no state update on an unmounted hook)', async () => {
    let resolve
    const printAgent = { getStatus: vi.fn(() => new Promise((r) => { resolve = r })), onStatus: vi.fn(() => () => {}) }
    setBridge({ isDesktop: true, deviceRole: 'counter', printAgent })
    const { result, unmount } = renderHook(() => useDesktopPrintAgent())
    unmount()
    await act(async () => { resolve(CONNECTED); await Promise.resolve() })
    expect(result.current.status).toBeNull()
  })
})
