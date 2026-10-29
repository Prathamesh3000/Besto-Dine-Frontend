import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toast, toast }))

const mocks = vi.hoisted(() => ({
  payrollAPI: {
    listProfiles: vi.fn(), saveProfile: vi.fn(), listRuns: vi.fn(), getRun: vi.fn(), createRun: vi.fn(),
    saveAdjustments: vi.fn(), finalize: vi.fn(), pay: vi.fn(), exportCsv: vi.fn(), getPayslip: vi.fn(),
  },
}))
vi.mock('@/utils/payrollApi', () => ({
  payrollAPI: mocks.payrollAPI,
  apiMessage: (e, f) => e?.response?.data?.message || f || 'err',
}))
vi.mock('@/Components/RequireFeature', () => ({ FeatureLockedScreen: () => <div data-testid="locked" /> }))

import Payroll from '@/Pages/Admin/Payroll'

const { payrollAPI } = mocks
const LINE = {
  staff: 's1', staffName: 'Asha', role: 'waiter', daysPresent: 20, hours: 170, overtimeHours: 10, basePay: 14000,
  overtimePay: 600, incentives: 50, tipsPaidOut: 30, advances: 0, deductions: 0, netPay: 14650, warnings: ['1 open shift(s) not counted'],
}
const RUN = (status) => ({
  _id: 'r1', status, periodStart: '2026-10-01', periodEnd: '2026-10-31', payoutMethod: status === 'paid' ? 'cash' : null,
  lines: [LINE], totals: { staffCount: 1, basePay: 14000, overtimePay: 600, incentives: 50, advances: 0, deductions: 0, netPay: 14650 },
})

function setAuth(over = {}) {
  auth = { hasFeature: () => true, user: { role: 'admin' }, ...over }
}
function renderPage() {
  const Wrapper = wrapperFor(makeQueryClient())
  return render(<Payroll />, { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth()
  payrollAPI.listRuns.mockResolvedValue({ data: { runs: [{ ...RUN('draft'), lines: undefined }] } })
  payrollAPI.listProfiles.mockResolvedValue({ data: { staff: [
    { staff: { _id: 's1', name: 'Asha', role: 'waiter' }, profile: { payType: 'daily', baseRate: 700, active: true } },
    { staff: { _id: 's2', name: 'Ravi', role: 'chef' }, profile: null },
  ] } })
  payrollAPI.getRun.mockResolvedValue({ data: { run: RUN('draft') } })
})

describe('Payroll page', () => {
  test('renders the runs list and the non-statutory notice', async () => {
    renderPage()
    expect(screen.getByText(/not statutory payroll/i)).toBeInTheDocument()
    expect(await screen.findByText('2026-10-01 to 2026-10-31')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create draft run' })).toBeInTheDocument()
  })

  test('locked plan and non-admin are blocked', () => {
    setAuth({ hasFeature: () => false })
    renderPage()
    expect(screen.getByTestId('locked')).toBeInTheDocument()
    setAuth({ user: { role: 'manager' } })
    renderPage()
    expect(screen.getByTestId('payroll-no-access')).toBeInTheDocument()
  })

  test('pay profiles tab lists staff, unset profiles show Not set, saving posts the form', async () => {
    payrollAPI.saveProfile.mockResolvedValue({ data: { profile: {} } })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Pay profiles' }))
    expect(await screen.findByText('Ravi')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit pay for Ravi' }))
    fireEvent.change(screen.getByLabelText('Pay type'), { target: { value: 'hourly' } })
    fireEvent.change(screen.getByLabelText('Base rate'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(payrollAPI.saveProfile).toHaveBeenCalledWith('s2', expect.objectContaining({ payType: 'hourly', baseRate: 90, overtimeRate: null })))
  })

  test('create draft opens the run; adjustments save, finalize and payslip work', async () => {
    payrollAPI.createRun.mockResolvedValue({ data: { run: RUN('draft'), skipped: [] } })
    payrollAPI.saveAdjustments.mockResolvedValue({ data: { run: RUN('draft') } })
    payrollAPI.finalize.mockResolvedValue({ data: { run: RUN('finalized') } })
    payrollAPI.getPayslip.mockResolvedValue({ data: { payslip: {
      staff: { name: 'Asha' }, periodStart: '2026-10-01', periodEnd: '2026-10-31',
      attendance: { daysPresent: 20, hours: 170 }, earnings: { basePay: 14000, overtimePay: 600, incentives: 50 },
      deductions: { advances: 100, deductions: 0 }, netPay: 14550,
    } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create draft run' }))
    await waitFor(() => expect(payrollAPI.createRun).toHaveBeenCalled())
    expect(await screen.findByTestId('payroll-run-detail')).toBeInTheDocument()
    expect(screen.getByText('1 open shift(s) not counted')).toBeInTheDocument()
    expect(screen.getByTestId('total-net')).toHaveTextContent('14650.00')

    fireEvent.change(screen.getByLabelText('Advances for Asha'), { target: { value: '100' } })
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeDisabled()   // unsaved edits
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustments' }))
    await waitFor(() => expect(payrollAPI.saveAdjustments).toHaveBeenCalledWith('r1', [{ staff: 's1', advances: 100, deductions: 0 }]))

    fireEvent.click(await screen.findByRole('button', { name: 'Finalize' }))
    await waitFor(() => expect(payrollAPI.finalize).toHaveBeenCalledWith('r1'))

    fireEvent.click(screen.getByRole('button', { name: 'Payslip for Asha' }))
    expect(await screen.findByTestId('payslip')).toHaveTextContent('14550.00')
  })

  test('a finalized run offers payout methods; wallet pay is sent once', async () => {
    payrollAPI.getRun.mockResolvedValue({ data: { run: RUN('finalized') } })
    payrollAPI.pay.mockResolvedValue({ data: { run: RUN('paid'), alreadyPaid: false } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByTestId('run-status')).toHaveTextContent('finalized')
    fireEvent.change(screen.getByLabelText('Payout method'), { target: { value: 'wallet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    await waitFor(() => expect(payrollAPI.pay).toHaveBeenCalledWith('r1', { method: 'wallet' }))
    expect(payrollAPI.pay).toHaveBeenCalledTimes(1)
  })

  test('server errors surface as a toast', async () => {
    payrollAPI.createRun.mockRejectedValue({ response: { data: { message: 'No eligible staff' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create draft run' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No eligible staff'))
  })
})
