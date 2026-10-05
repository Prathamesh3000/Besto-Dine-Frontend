/**
 * In-memory stand-in for a socket.io client socket. Records on/off so
 * tests can assert subscription hygiene (no leaked listeners) and lets a
 * test fire server events with `emit`.
 *
 * Not a test file (no .test suffix) — imported by tests that vi.mock
 * '@/utils/socket'.
 */
import { vi } from 'vitest'

export function createFakeSocket() {
  const handlers = new Map()
  const socket = {
    connected: true,
    on: vi.fn((ev, fn) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set())
      handlers.get(ev).add(fn)
      return socket
    }),
    off: vi.fn((ev, fn) => {
      handlers.get(ev)?.delete(fn)
      return socket
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    /** Simulate the server pushing `ev` to this client. */
    serverEmit(ev, ...args) {
      for (const fn of [...(handlers.get(ev) || [])]) fn(...args)
    },
    listenerCount(ev) {
      return handlers.get(ev)?.size ?? 0
    },
    totalListeners() {
      let n = 0
      handlers.forEach((s) => { n += s.size })
      return n
    },
    reset() {
      handlers.clear()
      socket.on.mockClear()
      socket.off.mockClear()
    },
  }
  return socket
}
