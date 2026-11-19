import { describe, test, expect } from 'vitest'
import { splitWalletPayment } from './walletSplit'

describe('splitWalletPayment', () => {
  test('no wallet: Razorpay pays the whole bill', () => {
    expect(splitWalletPayment({ grandTotal: 226.8, applied: 0 })).toEqual({ walletAmount: 0, razorpayAmount: 226.8, walletCoversFull: false, adjusted: null })
  })
  test('ordinary split is paise-exact and adds up to the bill', () => {
    const r = splitWalletPayment({ grandTotal: 1050, applied: 300, walletBalance: 500 })
    expect(r).toEqual({ walletAmount: 300, razorpayAmount: 750, walletCoversFull: false, adjusted: null })
  })
  test('wallet larger than the bill is capped at the bill', () => {
    expect(splitWalletPayment({ grandTotal: 226.8, applied: 5000, walletBalance: 5000 })).toMatchObject({ walletAmount: 226.8, razorpayAmount: 0, walletCoversFull: true })
  })
  test('Rs 226.80 bill, Rs 226 applied, balance covers the bill: 0.80 absorbed into the wallet', () => {
    expect(splitWalletPayment({ grandTotal: 226.8, applied: 226, walletBalance: 300 })).toEqual({ walletAmount: 226.8, razorpayAmount: 0, walletCoversFull: true, adjusted: 'absorbed' })
  })
  test('Rs 226.80 bill, balance of exactly Rs 226: wallet shrinks so Razorpay gets Rs 1.00 (never over-charged)', () => {
    const r = splitWalletPayment({ grandTotal: 226.8, applied: 226, walletBalance: 226 })
    expect(r).toEqual({ walletAmount: 225.8, razorpayAmount: 1, walletCoversFull: false, adjusted: 'reduced' })
    expect(r.walletAmount + r.razorpayAmount).toBeCloseTo(226.8, 10)
  })
  test('unknown balance falls back to the reduced split', () => {
    expect(splitWalletPayment({ grandTotal: 226.8, applied: 226 })).toMatchObject({ walletAmount: 225.8, razorpayAmount: 1, adjusted: 'reduced' })
  })
  test('remainder of exactly Rs 1 is left alone', () => {
    expect(splitWalletPayment({ grandTotal: 227, applied: 226, walletBalance: 226 })).toMatchObject({ walletAmount: 226, razorpayAmount: 1, adjusted: null })
  })
  test('floating-point bills never leave a stray paisa', () => {
    const r = splitWalletPayment({ grandTotal: 0.1 + 0.2 + 100, applied: 100, walletBalance: 100 })
    expect(r.walletAmount * 100 + r.razorpayAmount * 100).toBeCloseTo(10030, 6)
    expect(Number.isInteger(Math.round(r.razorpayAmount * 100))).toBe(true)
  })
})
