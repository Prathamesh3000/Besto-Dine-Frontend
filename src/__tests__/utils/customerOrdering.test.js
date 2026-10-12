import { describe, test, expect, beforeEach } from 'vitest'
import {
  QR_MENU_ONLY_NOTE, isCustomerSelfOrderOff, isDineInSelfOrderBlocked, serviceSpotLabel,
} from '@/utils/customerOrdering'
import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'

const MENU_ONLY = { orderFlow: { customerSelfOrder: false } }

beforeEach(() => {
  localStorage.clear()
  clearActiveTenant()
})

describe('customerOrdering helpers', () => {
  test('note copy', () => {
    expect(QR_MENU_ONLY_NOTE).toBe('Ordering at the table is not available — please order with the staff.')
  })

  test('self-order is on by default (no tenant / no profile)', () => {
    expect(isCustomerSelfOrderOff()).toBe(false)
    expect(isDineInSelfOrderBlocked()).toBe(false)
    setActiveTenant({ slug: 'cafe' })
    expect(isDineInSelfOrderBlocked()).toBe(false)
  })

  test('customerSelfOrder:false blocks dine-in (default order type) only', () => {
    expect(isDineInSelfOrderBlocked(MENU_ONLY)).toBe(true)
    localStorage.setItem('orderType', 'dine-in')
    expect(isDineInSelfOrderBlocked(MENU_ONLY)).toBe(true)
    localStorage.setItem('orderType', 'takeaway')
    expect(isDineInSelfOrderBlocked(MENU_ONLY)).toBe(false)
  })

  test('reads the active tenant profile', () => {
    setActiveTenant({ slug: 'hotel', operations: MENU_ONLY })
    expect(isCustomerSelfOrderOff()).toBe(true)
    expect(isDineInSelfOrderBlocked()).toBe(true)
  })

  test('customerSelfOrder:true / missing is not blocked', () => {
    expect(isDineInSelfOrderBlocked({ orderFlow: { customerSelfOrder: true } })).toBe(false)
    expect(isDineInSelfOrderBlocked({ orderFlow: {} })).toBe(false)
    expect(isDineInSelfOrderBlocked(null)).toBe(false)
  })

  test('serviceSpotLabel: Room for roomService, Table otherwise', () => {
    expect(serviceSpotLabel({ serviceModel: 'roomService' })).toBe('Room')
    expect(serviceSpotLabel({ serviceModel: 'counterService' })).toBe('Table')
    expect(serviceSpotLabel({ serviceModel: 'tableService' })).toBe('Table')
    expect(serviceSpotLabel()).toBe('Table')
  })
})
