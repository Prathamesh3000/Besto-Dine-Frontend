/**
 * Pages/Chef/utils/kdsBoard — render-cap rule + shared-clock formatter
 * behind the Kitchen Display System board.
 */
import { describe, test, expect } from 'vitest'
import { capBuckets, formatElapsed, KDS_MAX_CARDS, BUCKET_KEYS } from '@/Pages/Chef/utils/kdsBoard'

const NOW = new Date('2026-10-13T12:00:00.000Z').getTime()
const iso = (ms) => new Date(ms).toISOString()

// n orders, oldest first (index 0 is the oldest).
const many = (n, prefix, extra = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `${prefix}${i}`,
    createdAt: iso(NOW - (n - i) * 60_000),
    ...extra(i),
  }))

const emptyBuckets = () => Object.fromEntries(BUCKET_KEYS.map((k) => [k, []]))

describe('capBuckets', () => {
  test('default cap is 60', () => {
    expect(KDS_MAX_CARDS).toBe(60)
  })

  test('at or under the cap nothing is hidden and lists are returned as-is', () => {
    const b = { ...emptyBuckets(), prepare_now: many(40, 'p'), preparing: many(20, 'c') }
    const r = capBuckets(b, 60)
    expect(r.hiddenTotal).toBe(0)
    expect(r.total).toBe(60)
    expect(r.shown.prepare_now).toBe(b.prepare_now)
    expect(r.shown.preparing).toBe(b.preparing)
    expect(r.hiddenByBucket).toEqual({ upcoming: 0, prepare_now: 0, preparing: 0, ready_for_pickup: 0 })
  })

  test('one over the cap hides exactly one card and reports it', () => {
    const b = { ...emptyBuckets(), prepare_now: many(61, 'p') }
    const r = capBuckets(b, 60)
    expect(r.hiddenTotal).toBe(1)
    expect(r.shown.prepare_now).toHaveLength(60)
    // Head (most urgent / oldest in display order) is kept, tail dropped.
    expect(r.shown.prepare_now.map((o) => o._id)).toEqual(b.prepare_now.slice(0, 60).map((o) => o._id))
  })

  test('upcoming is trimmed first, all the way to zero, before any active bucket', () => {
    const b = { ...emptyBuckets(), upcoming: many(30, 'u'), prepare_now: many(50, 'p') }
    const r = capBuckets(b, 60)
    expect(r.hiddenTotal).toBe(20)
    expect(r.hiddenByBucket).toEqual({ upcoming: 20, prepare_now: 0, preparing: 0, ready_for_pickup: 0 })
    expect(r.shown.upcoming.map((o) => o._id)).toEqual(b.upcoming.slice(0, 10).map((o) => o._id))

    const r2 = capBuckets({ ...emptyBuckets(), upcoming: many(30, 'u'), prepare_now: many(60, 'p') }, 60)
    expect(r2.shown.upcoming).toHaveLength(0)
    expect(r2.shown.prepare_now).toHaveLength(60)
    expect(r2.hiddenTotal).toBe(30)
  })

  test('when active buckets exceed the cap the budget is shared proportionally and sums to the cap', () => {
    const b = {
      ...emptyBuckets(),
      upcoming: many(5, 'u'),
      prepare_now: many(90, 'p'),
      preparing: many(60, 'c'),
      ready_for_pickup: many(30, 'r'),
    }
    const r = capBuckets(b, 60)
    const shownTotal = BUCKET_KEYS.reduce((n, k) => n + r.shown[k].length, 0)
    expect(shownTotal).toBe(60)
    expect(r.shown.upcoming).toHaveLength(0)
    // 90:60:30 of 60 → 30:20:10
    expect(r.shown.prepare_now).toHaveLength(30)
    expect(r.shown.preparing).toHaveLength(20)
    expect(r.shown.ready_for_pickup).toHaveLength(10)
    expect(r.hiddenTotal).toBe(185 - 60)
  })

  test('largest-remainder never leaves slots unused or exceeds a bucket size', () => {
    const b = { ...emptyBuckets(), prepare_now: many(7, 'p'), preparing: many(100, 'c'), ready_for_pickup: many(3, 'r') }
    const r = capBuckets(b, 60)
    const shownTotal = BUCKET_KEYS.reduce((n, k) => n + r.shown[k].length, 0)
    expect(shownTotal).toBe(60)
    expect(r.shown.prepare_now.length).toBeLessThanOrEqual(7)
    expect(r.shown.ready_for_pickup.length).toBeLessThanOrEqual(3)
  })

  test('ready_for_pickup keeps urgent + OLDEST tickets and preserves display order (newest first)', () => {
    // Display order newest-first: index 0 is the newest ready ticket.
    const ready = Array.from({ length: 10 }, (_, i) => ({
      _id: `r${i}`,
      preparationCompletedAt: iso(NOW - i * 60_000),
      isUrgent: i === 2, // a newish one flagged urgent by the server
    }))
    const r = capBuckets({ ...emptyBuckets(), ready_for_pickup: ready }, 4)
    const ids = r.shown.ready_for_pickup.map((o) => o._id)
    // Kept: the urgent r2 plus the three oldest (r9, r8, r7) — in display order.
    expect(ids).toEqual(['r2', 'r7', 'r8', 'r9'])
    expect(r.hiddenByBucket.ready_for_pickup).toBe(6)
  })

  test('other buckets keep their head in display order', () => {
    const list = many(5, 'p')
    const r = capBuckets({ ...emptyBuckets(), prepare_now: list }, 3)
    expect(r.shown.prepare_now.map((o) => o._id)).toEqual(['p0', 'p1', 'p2'])
  })

  test('tolerates missing buckets and a zero cap', () => {
    const r = capBuckets({ prepare_now: many(3, 'p') }, 0)
    expect(r.shown.prepare_now).toEqual([])
    expect(r.shown.upcoming).toEqual([])
    expect(r.hiddenTotal).toBe(3)
  })
})

describe('formatElapsed (shared-clock version of useOrderTimer)', () => {
  const ago = (sec) => iso(NOW - sec * 1000)

  test.each([
    [12, '12s', 0],
    [60, '01:00', 1],
    [5 * 60 + 7, '05:07', 5],
    [2 * 3600 + 5 * 60, '2h 05m', 125],
    [27 * 3600, '1d 03h', 1620],
  ])('%i seconds → "%s" (%i min)', (sec, text, minutes) => {
    expect(formatElapsed(ago(sec), NOW)).toEqual({ text, minutes, totalSec: sec })
  })

  test('future start, bad date, or no clock → safe 00:00', () => {
    expect(formatElapsed(iso(NOW + 5000), NOW)).toEqual({ text: '00:00', minutes: 0, totalSec: 0 })
    expect(formatElapsed('not-a-date', NOW)).toEqual({ text: '00:00', minutes: 0, totalSec: 0 })
    expect(formatElapsed(ago(10), NaN)).toEqual({ text: '00:00', minutes: 0, totalSec: 0 })
  })
})
