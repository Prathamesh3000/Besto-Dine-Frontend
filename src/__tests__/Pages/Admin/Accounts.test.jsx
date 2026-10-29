import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toast, toast }))
const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
vi.mock('@/utils/api', () => ({ default: mocks.api }))

import CashClosing from '@/Pages/Admin/CashClosing'
import SupplierInvoices from '@/Pages/Admin/SupplierInvoices'
import Ledger from '@/Pages/Admin/Ledger'
import { cashVariance, money } from '@/utils/accountsApi'

const { api } = mocks

function renderPage(el) {
  const Wrapper = wrapperFor(makeQueryClient())
  return render(<MemoryRouter><Wrapper>{el}</Wrapper></MemoryRouter>)
}

const PREVIEW_NONE = { success: true, status: 'none', closing: null, openingCash: 0, cashSales: 1000, cashRefunds: 100, cashPaidOuts: 200, expectedCash: 700 }

beforeEach(() => {
  vi.clearAllMocks()
  auth = { user: { role: 'admin' } }
})

describe('accountsApi helpers', () => {
  test('cashVariance mirrors counted - expected', () => {
    expect(cashVariance(700, '650')).toBe(-50)
    expect(cashVariance(700, '')).toBeNull()
    expect(money(1234.5)).toContain('1,234.50')
  })
})

describe('CashClosing page', () => {
  function route(url, { preview = PREVIEW_NONE, closings = [], expenses = [] } = {}) {
    if (url.startsWith('/cash-closings/preview')) return Promise.resolve({ data: preview })
    if (url.startsWith('/cash-closings')) return Promise.resolve({ data: { success: true, closings } })
    if (url.startsWith('/ledger/expenses')) return Promise.resolve({ data: { success: true, expenses } })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  }

  test('shows expected cash and a live variance, then closes the day', async () => {
    api.get.mockImplementation((url) => route(url))
    api.post.mockResolvedValue({ data: { success: true } })
    renderPage(<CashClosing />)
    expect(await screen.findByTestId('cc-expected')).toHaveTextContent('700.00')
    expect(screen.getByTestId('cc-status')).toHaveTextContent('Not opened')

    fireEvent.change(screen.getByLabelText('Counted cash'), { target: { value: '650' } })
    expect(screen.getByTestId('cc-live-variance')).toHaveTextContent('-')
    expect(screen.getByTestId('cc-live-variance')).toHaveTextContent('50.00')

    fireEvent.click(screen.getByRole('button', { name: 'Close day' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/cash-closings/close')
    expect(body.countedCash).toBe(650)
  })

  test('closed day shows stored variance and the admin amend form; history lists rows', async () => {
    const closing = { _id: 'c1', status: 'closed', businessDate: '2026-10-01', openingCash: 500, cashSales: 1000, cashRefunds: 0, cashPaidOuts: 0, expectedCash: 1500, countedCash: 1450, variance: -50, notes: 'short', edits: [] }
    api.get.mockImplementation((url) => route(url, {
      preview: { success: true, status: 'closed', closing, openingCash: 500, cashSales: 9999, cashRefunds: 0, cashPaidOuts: 0, expectedCash: 9999 },
      closings: [closing],
    }))
    renderPage(<CashClosing />)
    expect(await screen.findByTestId('cc-variance')).toHaveTextContent('50.00')
    expect(screen.getByTestId('cc-sales')).toHaveTextContent('1,000.00') // snapshot, not the live 9999
    expect(screen.getByLabelText('Reason (required)')).toBeInTheDocument()
    expect(await screen.findAllByTestId('cc-history-row')).toHaveLength(1)
  })

  test('a manager cannot see the amend form on a closed day', async () => {
    auth = { user: { role: 'manager' } }
    const closing = { _id: 'c1', status: 'closed', businessDate: '2026-10-01', openingCash: 0, cashSales: 0, cashRefunds: 0, cashPaidOuts: 0, expectedCash: 0, countedCash: 0, variance: 0, edits: [] }
    api.get.mockImplementation((url) => route(url, { preview: { success: true, status: 'closed', closing, ...closing } }))
    renderPage(<CashClosing />)
    await screen.findByTestId('cc-variance')
    expect(screen.queryByLabelText('Reason (required)')).toBeNull()
  })
})

describe('SupplierInvoices page', () => {
  const INV = { _id: 'i1', supplier: { name: 'Fresh Farms' }, invoiceNo: 'FF-1', businessDate: '2026-10-01', dueDate: '2026-10-15T00:00:00Z', total: 1000, amountPaid: 400, outstanding: 600, status: 'partial' }

  test('lists invoices and records a payment capped at the outstanding amount', async () => {
    api.get.mockResolvedValue({ data: { success: true, invoices: [INV] } })
    api.post.mockResolvedValue({ data: { success: true } })
    renderPage(<SupplierInvoices />)
    expect(await screen.findByText('FF-1')).toBeInTheDocument()
    expect(screen.getByTestId('si-row')).toHaveTextContent('600.00')

    fireEvent.click(screen.getByRole('button', { name: 'Pay' }))
    const amount = screen.getByLabelText('Amount')
    expect(amount.value).toBe('600')
    expect(amount).toHaveAttribute('max', '600')
    fireEvent.change(amount, { target: { value: '700' } })
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled()
    fireEvent.change(amount, { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/supplier-invoices/i1/payments', expect.objectContaining({ amount: 250, method: 'cash' }), expect.anything()))
  })

  test('add-invoice form shows the computed total and the empty state renders', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/suppliers' ? { suppliers: [{ _id: 's1', name: 'Fresh Farms' }] } : { success: true, invoices: [] } }))
    renderPage(<SupplierInvoices />)
    expect(await screen.findByTestId('si-empty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add invoice' }))
    fireEvent.change(screen.getByLabelText('Subtotal'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Tax'), { target: { value: '18' } })
    expect(screen.getByTestId('si-total')).toHaveTextContent('118.00')
  })

  test('outstanding tab shows aging rows', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('outstanding')
      ? { success: true, rows: [{ supplier: 's1', supplierName: 'Fresh Farms', notDue: 0, d1_30: 100, d31_60: 0, d61_90: 0, over90: 50, total: 150 }], totals: { notDue: 0, d1_30: 100, d31_60: 0, d61_90: 0, over90: 50, total: 150 } }
      : { success: true, invoices: [] } }))
    renderPage(<SupplierInvoices />)
    fireEvent.click(screen.getByRole('button', { name: 'Outstanding' }))
    expect(await screen.findByTestId('out-row')).toHaveTextContent('Fresh Farms')
    expect(screen.getByTestId('out-total')).toHaveTextContent('150.00')
  })
})

describe('Ledger page', () => {
  test('renders P&L and a balanced trial balance', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('trial-balance')) return Promise.resolve({ data: { success: true, balanced: true, totals: { debit: 500, credit: 500 }, rows: [
        { code: '1000', name: 'Cash in hand', type: 'asset', debit: 500, credit: 0, balance: 500 },
        { code: '4000', name: 'Sales', type: 'income', debit: 0, credit: 500, balance: 500 },
      ] } })
      if (url.includes('pnl')) return Promise.resolve({ data: { success: true, income: [{ code: '4000', name: 'Sales', balance: 500 }], totalIncome: 500, cogs: 100, grossProfit: 400, expenses: [{ code: '5100', name: 'Operating expenses', balance: 50 }], totalExpenses: 50, netProfit: 350, note: 'n' } })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    renderPage(<Ledger />)
    expect(await screen.findByTestId('pnl-net')).toHaveTextContent('350.00')
    expect(screen.getByTestId('pnl-cogs')).toHaveTextContent('100.00')
    expect(screen.getAllByTestId('tb-row')).toHaveLength(2)
    expect(screen.getByTestId('tb-debit').textContent).toBe(screen.getByTestId('tb-credit').textContent)
    expect(screen.queryByText(/OUT OF BALANCE/)).toBeNull()
  })
})
