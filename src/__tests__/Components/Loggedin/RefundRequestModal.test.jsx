import React from 'react'
import { describe, test, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))
const create = vi.fn()
// failWith: reject from a plain async fn (a spy that returns a rejected promise is flagged unhandled by vitest)
let failWith = null
vi.mock('../../../utils/api', () => ({
  refundRequestAPI: { create: (...a) => { const r = create(...a); return failWith ? (async () => { throw failWith })() : r } },
}))

import RefundRequestModal from '../../../Components/Loggedin/RefundRequestModal'
import { refundableBalance } from '../../../utils/refund'

const order = { id: 'ORD-0001', orderId: 'ORD-0001', amountPaid: 500, refundedAmount: 100 }

beforeEach(() => { create.mockReset(); failWith = null })
afterEach(cleanup)

describe('refundableBalance', () => {
  test('paid minus refunded, never negative', () => {
    expect(refundableBalance(order)).toBe(400)
    expect(refundableBalance({ amountPaid: 100, refundedAmount: 150 })).toBe(0)
    expect(refundableBalance({})).toBe(0)
  })
})

describe('RefundRequestModal', () => {
  test('Send is disabled until a reason is picked, "Other" needs text', () => {
    render(<RefundRequestModal order={order} onClose={() => {}} />)
    const send = screen.getByText('Send request').closest('button')
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByText('Food quality issue'))
    expect(send.disabled).toBe(false)
    fireEvent.click(screen.getByText('Other'))
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Tell us what went wrong'), { target: { value: 'cold food' } })
    expect(send.disabled).toBe(false)
  })

  test('full refund omits amount; sends reason and order id', async () => {
    create.mockResolvedValue({ data: { refundRequest: { amount: 400 } } })
    const onClose = vi.fn(); const onSubmitted = vi.fn()
    render(<RefundRequestModal order={order} onClose={onClose} onSubmitted={onSubmitted} />)
    fireEvent.click(screen.getByText('Paid twice'))
    fireEvent.click(screen.getByText('Send request'))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({ orderId: 'ORD-0001', reason: 'Paid twice' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSubmitted).toHaveBeenCalled()
  })

  test('partial amount is validated against the refundable balance', async () => {
    create.mockResolvedValue({ data: { refundRequest: { amount: 150 } } })
    render(<RefundRequestModal order={order} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Wrong or missing item'))
    fireEvent.click(screen.getByLabelText('Refund only part of the bill'))
    const input = screen.getByLabelText('Refund amount in rupees')
    const send = screen.getByText('Send request').closest('button')
    fireEvent.change(input, { target: { value: '401' } })
    expect(send.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '0' } })
    expect(send.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '150' } })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    await waitFor(() => expect(create).toHaveBeenCalledWith({ orderId: 'ORD-0001', reason: 'Wrong or missing item', amount: 150 }))
  })

  test('a server error keeps the sheet open', async () => {
    failWith = Object.assign(new Error('Request failed'), { response: { status: 400, data: { message: 'Only paid orders can be refunded' } } })
    const onClose = vi.fn()
    render(<RefundRequestModal order={order} onClose={onClose} />)
    fireEvent.click(screen.getByText('Food quality issue'))
    fireEvent.click(screen.getByText('Send request'))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })
})
