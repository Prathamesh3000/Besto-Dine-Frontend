import { describe, test, expect } from 'vitest'
import { getWaiterScope, countReadyOrders } from '@/utils/waiterScope'

describe('countReadyOrders', () => {
  const orders = [
    { status: 'ready', table: { _id: 't1', area: 'a1' } },
    { status: 'ready', table: { _id: 't2', area: 'a2' } },
    { status: 'ready' }, // takeaway
    { status: 'new', table: { _id: 't1', area: 'a1' } },
  ]
  test('captain counts dine-in and takeaway ready orders', () => {
    expect(countReadyOrders(orders, getWaiterScope({ role: 'captain' }))).toBe(3)
  })
  test('area-pinned waiter without takeaway sees only own-area ready orders', () => {
    expect(countReadyOrders(orders, getWaiterScope({ role: 'waiter', assignedAreas: ['a1'] }))).toBe(1)
  })
  test('tolerates missing orders', () => {
    expect(countReadyOrders(undefined, getWaiterScope({ role: 'waiter' }))).toBe(0)
  })
})
