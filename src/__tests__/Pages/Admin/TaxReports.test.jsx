import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper'

const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() } }))
vi.mock('@/utils/api', () => ({ default: mocks.api }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

import TaxReports from '@/Pages/Admin/TaxReports'
import { parseRecipients } from '@/utils/taxReports'

const { api } = mocks

const REPORT = {
  meta: { truncated: false },
  totals: { invoiceCount: 2, taxable: 2000, cgst: 50, sgst: 50, igst: 0, tax: 100, serviceCharge: 100, otherCharges: 0, invoiceTotal: 2200 },
  byRate: [{ rate: 5, invoices: 2, taxable: 2000, cgst: 50, sgst: 50, igst: 0, tax: 100 }],
  hsn: [{ hsn: '996331', description: 'Restaurant service', uqc: 'NOS', rate: 5, qty: 6, totalValue: 2100, taxable: 2000, igst: 0, cgst: 50, sgst: 50 }],
  invoices: [{ billNo: '2026-27/7', orderId: 'ORD-1', date: '2026-10-10T08:00:00Z', customerGstin: '', taxable: 1000, tax: 50, total: 1100, reconciled: true }],
  cancelled: [{ billNo: '', orderId: 'ORD-C', total: 500, refunded: 0 }],
  refunded: [], partialRefunds: [],
  selfCheck: { ok: true, note: 'Taxable value, tax and invoice totals tie out within 0.01.' },
}
const SCHEDULE = { _id: 's1', type: 'gst-summary', frequency: 'monthly', hour: 8, recipients: ['ca@firm.com'], enabled: true, lastError: '' }

function renderPage() {
  const Wrapper = wrapperFor(makeQueryClient())
  return render(<Wrapper><TaxReports /></Wrapper>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(async (url) => {
    if (url === '/reports/gst/summary') return { data: { success: true, report: REPORT } }
    if (url === '/reports/schedules') return { data: { success: true, schedules: [SCHEDULE], limit: 10 } }
    if (url === '/reports/gst/config') return { data: { success: true, config: { defaultHsn: '996331', partyMode: 'cash', ledgers: {} }, ledgerDefaults: { sales: 'Sales - Restaurant' } } }
    return { data: {} }
  })
  api.post.mockResolvedValue({ data: { success: true } })
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('TaxReports page', () => {
  test('shows the export-aid disclaimer', async () => {
    renderPage()
    expect(screen.getByTestId('tax-disclaimer').textContent).toMatch(/not a filing tool/i)
    await screen.findByTestId('schedule-row')
  })

  test('view report renders totals, HSN table, register and the cancelled list', async () => {
    renderPage()
    fireEvent.click(screen.getByText('View report'))
    expect(await screen.findByTestId('gst-selfcheck')).toHaveTextContent('Self-check OK')
    expect(screen.getByTestId('gst-hsn')).toHaveTextContent('996331')
    expect(screen.getByTestId('gst-invoices')).toHaveTextContent('2026-27/7')
    expect(screen.getByTestId('gst-excluded')).toHaveTextContent('ORD-C')
    const call = api.get.mock.calls.find((c) => c[0] === '/reports/gst/summary')
    expect(call[1].params.from).toMatch(/^\d{4}-\d{2}-01$/)
  })

  test('lists schedules and can disable one', async () => {
    renderPage()
    expect(await screen.findByTestId('schedule-row')).toHaveTextContent('ca@firm.com')
    fireEvent.click(screen.getByText('Disable'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/reports/schedules/s1', { enabled: false }))
  })

  test('creates a schedule with parsed recipients', async () => {
    renderPage()
    await screen.findByTestId('schedule-row')
    fireEvent.change(screen.getByLabelText('Recipients'), { target: { value: 'a@x.com, b@y.in' } })
    fireEvent.click(screen.getByText('Add schedule'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/reports/schedules', {
      type: 'gst-summary', frequency: 'monthly', hour: 8, recipients: ['a@x.com', 'b@y.in'],
    }))
  })

  test('tax export settings load and save', async () => {
    api.put.mockResolvedValue({ data: { success: true } })
    renderPage()
    const hsn = await screen.findByLabelText('Default HSN/SAC')
    expect(hsn.value).toBe('996331')
    fireEvent.change(hsn, { target: { value: '996332' } })
    fireEvent.click(screen.getByText('Save settings'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/reports/gst/config', expect.objectContaining({ defaultHsn: '996332' })))
  })

  test('parseRecipients splits on commas, spaces and semicolons', () => {
    expect(parseRecipients('a@x.com, b@y.in;c@z.co  d@e.fg')).toEqual(['a@x.com', 'b@y.in', 'c@z.co', 'd@e.fg'])
    expect(parseRecipients('')).toEqual([])
  })
})
