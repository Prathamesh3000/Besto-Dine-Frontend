import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TableTimer from '@/Components/Common/TableTimer'
import { formatDuration, timerLevel } from '@/utils/tableTimer'
import { syncServerClock, resetServerClock } from '@/hooks/useServerClock'

const REAL = Date.parse('2026-11-19T10:00:00.000Z')
const MIN = 60000
const at = (m, props = {}) => render(<TableTimer startedAt={new Date(REAL - m * MIN).toISOString()} {...props} />)

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(REAL); resetServerClock(); syncServerClock(new Date(REAL).toISOString()) })
afterEach(() => { cleanup(); vi.useRealTimers(); resetServerClock() })

describe('formatDuration', () => {
  test.each([[0, '0 min'], [42, '42 min'], [59, '59 min'], [60, '1 h 00 min'], [65, '1 h 05 min'], [125, '2 h 05 min']])('%i -> %s', (m, s) => {
    expect(formatDuration(m)).toBe(s)
  })
})

describe('colour thresholds (default 60/90)', () => {
  test.each([[59, 'ok'], [60, 'amber'], [89, 'amber'], [90, 'red']])('%i min -> %s', (m, state) => {
    at(m)
    expect(screen.getByTestId('table-timer')).toHaveAttribute('data-state', state)
  })
  test('custom thresholds via props', () => {
    expect(timerLevel(29, 30, 45)).toBe('ok')
    expect(timerLevel(30, 30, 45)).toBe('amber')
    expect(timerLevel(45, 30, 45)).toBe('red')
    at(35, { amberMinutes: 30, redMinutes: 45 })
    expect(screen.getByTestId('table-timer')).toHaveAttribute('data-state', 'amber')
  })
})

describe('rendering', () => {
  test('text + aria-label, not colour only', () => {
    at(42)
    expect(screen.getByRole('timer', { name: 'Occupied 42 minutes' })).toHaveTextContent('42 min')
  })
  test('red state is labelled for assistive tech', () => {
    at(95)
    expect(screen.getByTestId('table-timer')).toHaveAttribute('aria-label', 'Occupied 1 hour 35 minutes - overdue')
  })
  test('drawer label prefix', () => {
    at(42, { label: 'Occupied' })
    expect(screen.getByTestId('table-timer')).toHaveTextContent('Occupied 42 min')
  })
  test('future start never goes below 0', () => {
    at(-5)
    expect(screen.getByTestId('table-timer')).toHaveTextContent('0 min')
  })
  test.each([[undefined], [null], [''], ['not-a-date']])('renders nothing for %s', (v) => {
    const { container } = render(<TableTimer startedAt={v} />)
    expect(container).toBeEmptyDOMElement()
  })
})
