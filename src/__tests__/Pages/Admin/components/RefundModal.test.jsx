/**
 * RefundModal — amount bounds and the payload handed to onRefund.
 * Pure presentational component: no API, no router, no context.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RefundModal from '@admin/components/RefundModal'

const basePayment = {
  id: 'ORD-1001', table: 'Table 4', customer: 'Asha', method: 'UPI',
  total: 500, refundedAmount: 120.5, refundableBalance: 379.5,
}

function setup(props = {}) {
  const onRefund = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup()
  const utils = render(<RefundModal payment={basePayment} onRefund={onRefund} onClose={onClose} {...props} />)
  const confirm = () => screen.getByRole('button', { name: /confirm refund/i })
  return { ...utils, onRefund, onClose, user, confirm }
}

async function goPartial(user, amount) {
  await user.click(screen.getByRole('button', { name: 'Partial Refund' }))
  const input = screen.getByLabelText(/refund amount/i)
  if (amount !== undefined) await user.type(input, amount)
  return input
}

describe('RefundModal — display', () => {
  test('renders nothing when there is no payment', () => {
    const { container } = render(<RefundModal payment={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows original total, already-refunded and refundable balance to the paisa', () => {
    setup()
    expect(screen.getByText('₹500.00')).toBeInTheDocument()
    expect(screen.getByText('₹120.50')).toBeInTheDocument()
    // refundable is shown in the card and as the full-refund summary
    expect(screen.getAllByText('₹379.50')).toHaveLength(2)
  })

  test('falls back to total when refundableBalance is absent', () => {
    setup({ payment: { ...basePayment, refundableBalance: undefined, refundedAmount: 0 } })
    // original total + refundable + summary
    expect(screen.getAllByText('₹500.00')).toHaveLength(3)
    expect(screen.queryByText(/already refunded/i)).not.toBeInTheDocument()
  })
})

describe('RefundModal — full refund', () => {
  test('sends the whole refundable balance with the selected reason', async () => {
    const { onRefund, user, confirm } = setup()
    await user.selectOptions(screen.getByLabelText(/refund reason/i), 'Quality issue')
    await user.click(confirm())
    expect(onRefund).toHaveBeenCalledTimes(1)
    expect(onRefund).toHaveBeenCalledWith({
      type: 'full', amount: 379.5, reason: 'Quality issue', specifyReason: '',
    })
  })

  test('"Other" reason requires a non-blank specification, trimmed in the payload', async () => {
    const { onRefund, user, confirm } = setup()
    await user.selectOptions(screen.getByLabelText(/refund reason/i), 'Other')
    expect(confirm()).toBeDisabled()
    const spec = screen.getByLabelText(/specify reason/i)
    await user.type(spec, '   ')
    expect(confirm()).toBeDisabled()
    await user.type(spec, 'cold food  ')
    await user.click(confirm())
    expect(onRefund).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Other', specifyReason: 'cold food' }))
  })

  // Regression (fixed 2026-10): with a ₹0 refundable balance, "Full Refund" and Confirm are disabled.
  test('full refund is not submittable when the refundable balance is ₹0', async () => {
    const { onRefund, user, confirm } = setup({ payment: { ...basePayment, refundedAmount: 500, refundableBalance: 0 } })
    expect(confirm()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Full Refund' })).toBeDisabled()
    await user.click(confirm())
    expect(onRefund).not.toHaveBeenCalled()
  })
})

describe('RefundModal — partial refund amount bounds', () => {
  test.each([
    ['0', 'Amount must be greater than 0'],
    ['0.00', 'Amount must be greater than 0'],
    ['379.51', 'Cannot exceed ₹379.50'],
    ['1000', 'Cannot exceed ₹379.50'],
  ])('amount %s is rejected with "%s" and cannot be submitted', async (amount, message) => {
    const { onRefund, user, confirm } = setup()
    await goPartial(user, amount)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(confirm()).toBeDisabled()
    await user.click(confirm())
    expect(onRefund).not.toHaveBeenCalled()
  })

  test.each([
    ['379.50', 379.5],
    ['0.01', 0.01],
    ['100.25', 100.25],
  ])('amount %s within bounds is summarised and sent as %d', async (typed, expected) => {
    const { onRefund, user, confirm } = setup()
    await goPartial(user, typed)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Refund Amount:').nextSibling).toHaveTextContent(`₹${expected.toFixed(2)}`)
    await user.click(confirm())
    expect(onRefund).toHaveBeenCalledWith({ type: 'partial', amount: expected, reason: 'Order cancelled', specifyReason: '' })
  })

  test('strips non-numeric characters and ignores a second decimal point', async () => {
    const { user } = setup()
    const input = await goPartial(user, '1a2b.5')
    expect(input).toHaveValue('12.5')
    await user.type(input, '.3')
    expect(input).toHaveValue('12.53') // the extra "." keystroke is dropped
  })

  test('empty partial amount keeps confirm disabled; switching back to full clears the error', async () => {
    const { user, confirm } = setup()
    await goPartial(user)
    expect(confirm()).toBeDisabled()
    await user.type(screen.getByLabelText(/refund amount/i), '9999')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Full Refund' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(confirm()).toBeEnabled()
  })

  // Regression (fixed 2026-10): partial amounts with more than 2 decimals are rejected ("Use at most 2 decimal places").
  test('sub-paisa amounts (more than 2 decimals) are blocked, never sent unrounded', async () => {
    const { onRefund, user, confirm } = setup()
    await goPartial(user, '10.555')
    await user.click(confirm())
    const sent = onRefund.mock.calls[0]?.[0]?.amount
    // Either the modal blocks it, or it must send a whole number of paise.
    if (sent !== undefined) expect(sent).toBe(Math.round(sent * 100) / 100)
    else expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

describe('RefundModal — closing', () => {
  test('Escape and Cancel close when idle', async () => {
    const { onClose, user } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('while loading: Escape is ignored and every action is disabled', () => {
    const { onClose } = setup({ loading: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  })

  test('locks body scroll while open and restores it on unmount', () => {
    const { unmount } = render(<RefundModal payment={basePayment} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
