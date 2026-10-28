/**
 * Admin → Settings → Payment QR (UPI): values render, client-side format
 * check blocks save, save sends { upiId, upiPayeeName }, server 400s show
 * under the field, Clear sends empty strings, inherited note, role gate.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  settingsAPI: { updateSection: vi.fn() },
}))
const auth = { user: { role: 'admin' } }
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => auth,
  ADMIN_ROLES: ['admin', 'manager'],
}))

import { toast } from 'react-hot-toast'
import { settingsAPI } from '@/utils/api'
import PaymentQrSettings from '@admin/components/PaymentQrSettings'

const INITIAL = { upiId: 'cafe@okaxis', upiPayeeName: 'Cafe One', upiIdMasked: 'ca***@okaxis', upiConfigured: true, upiInherited: false }

function setup(initial = INITIAL) {
  const user = userEvent.setup()
  const onSaved = vi.fn()
  render(<PaymentQrSettings initial={initial} onSaved={onSaved} />)
  return { user, onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { role: 'admin' }
  settingsAPI.updateSection.mockResolvedValue({ data: { success: true } })
})

describe('PaymentQrSettings', () => {
  test('renders saved values and the On chip', () => {
    setup()
    expect(screen.getByLabelText('UPI ID')).toHaveValue('cafe@okaxis')
    expect(screen.getByLabelText('Payee name')).toHaveValue('Cafe One')
    expect(screen.getByTestId('qr-status')).toHaveTextContent('QR on bills: On')
    expect(screen.queryByText(/Using the main restaurant/)).not.toBeInTheDocument()
  })

  test('shows Off chip when not configured', () => {
    setup({ upiConfigured: false })
    expect(screen.getByTestId('qr-status')).toHaveTextContent('QR on bills: Off')
  })

  test('invalid format blocks save', async () => {
    const { user } = setup()
    const input = screen.getByLabelText('UPI ID')
    await user.clear(input)
    await user.type(input, 'not-a-upi')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/valid UPI ID/)).toBeInTheDocument()
    expect(settingsAPI.updateSection).not.toHaveBeenCalled()
  })

  test('successful save sends exactly { upiId, upiPayeeName }, lowercased', async () => {
    const { user, onSaved } = setup({ upiConfigured: false })
    await user.type(screen.getByLabelText('UPI ID'), 'MyShop@OkAxis')
    await user.type(screen.getByLabelText('Payee name'), 'My Shop')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(settingsAPI.updateSection).toHaveBeenCalledWith('payments', { upiId: 'myshop@okaxis', upiPayeeName: 'My Shop' }))
    expect(toast.success).toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
  })

  test('server 400 error is shown under the UPI field', async () => {
    settingsAPI.updateSection.mockRejectedValue({ response: { status: 400, data: { success: false, message: 'Invalid', errors: { upiId: 'UPI ID looks wrong' } } } })
    const { user } = setup()
    const input = screen.getByLabelText('UPI ID')
    await user.clear(input)
    await user.type(input, 'abc@bank')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('UPI ID looks wrong')).toBeInTheDocument()
  })

  test('Clear sends empty strings for both', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Clear/ }))
    await waitFor(() => expect(settingsAPI.updateSection).toHaveBeenCalledWith('payments', { upiId: '', upiPayeeName: '' }))
  })

  test('shows the inherited info line', () => {
    setup({ upiId: '', upiPayeeName: '', upiConfigured: true, upiInherited: true })
    expect(screen.getByText('Using the main restaurant UPI ID. Save here to use a different one for this branch.')).toBeInTheDocument()
  })

  test('renders nothing for roles without access', () => {
    auth.user = { role: 'waiter' }
    setup()
    expect(screen.queryByTestId('payment-qr-settings')).not.toBeInTheDocument()
  })
})
