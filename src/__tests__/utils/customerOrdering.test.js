import { describe, test, expect, beforeEach } from 'vitest'
import {
  QR_MENU_ONLY_NOTE, isCustomerSelfOrderOff, isDineInSelfOrderBlocked, serviceSpotLabel, dineInPaymentChoice,
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

describe('dineInPaymentChoice', () => {
  test('no profile / no payment block / unknown value → payAfter (today)', () => {
    expect(dineInPaymentChoice()).toBe('payAfter')
    expect(dineInPaymentChoice(null)).toBe('payAfter')
    expect(dineInPaymentChoice({})).toBe('payAfter')
    expect(dineInPaymentChoice({ payment: {} })).toBe('payAfter')
    expect(dineInPaymentChoice({ payment: { dineIn: 'bogus' } })).toBe('payAfter')
    setActiveTenant({ slug: 'cafe' })
    expect(dineInPaymentChoice()).toBe('payAfter')
  })

  test('passes payFirst / payAfter / either through', () => {
    expect(dineInPaymentChoice({ payment: { dineIn: 'payFirst' } })).toBe('payFirst')
    expect(dineInPaymentChoice({ payment: { dineIn: 'payAfter' } })).toBe('payAfter')
    expect(dineInPaymentChoice({ payment: { dineIn: 'either' } })).toBe('either')
  })

  test('reads the active tenant profile by default', () => {
    setActiveTenant({ slug: 'hotel', operations: { payment: { dineIn: 'either' } } })
    expect(dineInPaymentChoice()).toBe('either')
  })
})
