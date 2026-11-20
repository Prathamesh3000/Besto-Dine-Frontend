import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import TableTimer from '@/Components/Common/TableTimer'
import { syncServerClock, resetServerClock, serverNow, setTableTimerConfig, getTableTimerConfig, ingestTableTimerMeta, canSeeTableTimer, TICK_MS } from '@/hooks/useServerClock'
import { patchTableTimer } from '@/hooks/queries/useAdminBootstrap'

const REAL = Date.parse('2026-11-19T10:00:00.000Z')
const MIN = 60000

beforeEach(() => { vi.useFakeTimers(); resetServerClock() })
afterEach(() => { cleanup(); vi.useRealTimers(); resetServerClock() })

describe('server clock offset', () => {
  test.each([['+1h', 3600000], ['-1h', -3600000], ['correct', 0]])('device clock %s still shows 42 min', (_n, skew) => {
    vi.setSystemTime(REAL + skew)
    syncServerClock(new Date(REAL).toISOString())
    expect(serverNow()).toBe(REAL)
    render(<TableTimer startedAt={new Date(REAL - 42 * MIN).toISOString()} />)
    expect(screen.getByTestId('table-timer')).toHaveTextContent('42 min')
  })

  test('round trip compensation uses half the trip', () => {
    vi.setSystemTime(REAL)
    syncServerClock(new Date(REAL).toISOString(), REAL - 1000, REAL + 1000)
    expect(serverNow()).toBe(REAL)
    syncServerClock(new Date(REAL + 500).toISOString(), REAL - 400, REAL + 400)
    expect(serverNow()).toBe(REAL + 500)
  })

  test('invalid serverTime leaves offset untouched; invalid config ignored', () => {
    vi.setSystemTime(REAL + 1000)
    syncServerClock('garbage')
    expect(serverNow()).toBe(REAL + 1000)
    setTableTimerConfig({ amberMinutes: 90, redMinutes: 60 })
    setTableTimerConfig({ amberMinutes: 0, redMinutes: 60 })
    expect(getTableTimerConfig()).toEqual({ amberMinutes: 60, redMinutes: 90 })
    ingestTableTimerMeta({ serverTime: new Date(REAL + 1000).toISOString(), tableTimer: { amberMinutes: 30, redMinutes: 45 } })
    expect(getTableTimerConfig()).toEqual({ amberMinutes: 30, redMinutes: 45 })
  })

  test('role gating helper', () => {
    expect(['admin', 'manager', 'captain'].every(canSeeTableTimer)).toBe(true)
    expect(['waiter', 'chef', 'customer', undefined].some(canSeeTableTimer)).toBe(false)
  })
})

describe('shared ticker', () => {
  test('one interval for many cards, ticks update, cleanup on unmount', () => {
    vi.setSystemTime(REAL)
    syncServerClock(new Date(REAL).toISOString())
    const spy = vi.spyOn(globalThis, 'setInterval')
    const start = new Date(REAL - 59 * MIN).toISOString()
    const { unmount } = render(<>{Array.from({ length: 20 }, (_, i) => <TableTimer key={i} startedAt={start} />)}</>)
    expect(spy.mock.calls.filter(c => c[1] === TICK_MS)).toHaveLength(1)
    expect(screen.getAllByTestId('table-timer')[0]).toHaveAttribute('data-state', 'ok')
    act(() => { vi.advanceTimersByTime(TICK_MS * 2) })
    expect(screen.getAllByTestId('table-timer')[0]).toHaveTextContent('1 h 00 min')
    expect(screen.getAllByTestId('table-timer')[0]).toHaveAttribute('data-state', 'amber')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('refreshes immediately when the tab becomes visible', () => {
    vi.setSystemTime(REAL)
    syncServerClock(new Date(REAL).toISOString())
    render(<TableTimer startedAt={new Date(REAL - 10 * MIN).toISOString()} />)
    expect(screen.getByTestId('table-timer')).toHaveTextContent('10 min')
    vi.setSystemTime(REAL + 5 * MIN)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(screen.getByTestId('table-timer')).toHaveTextContent('15 min')
  })
})

describe('patchTableTimer', () => {
  const tables = [{ _id: 'a', sessionStartedAt: null }, { _id: 'b', sessionStartedAt: 'x' }]
  test('sets and clears one table, no-op keeps identity', () => {
    const set = patchTableTimer(tables, 'a', '2026-11-19T09:00:00.000Z')
    expect(set[0].sessionStartedAt).toBe('2026-11-19T09:00:00.000Z')
    expect(set[1]).toBe(tables[1])
    expect(patchTableTimer(set, 'a', null)[0].sessionStartedAt).toBeNull()
    expect(patchTableTimer(tables, 'a', null)).toBe(tables)
    expect(patchTableTimer(tables, 'zzz', 'y')).toBe(tables)
  })
})
