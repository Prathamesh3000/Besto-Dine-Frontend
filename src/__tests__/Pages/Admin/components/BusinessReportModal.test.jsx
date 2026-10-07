import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let tier = 'advanced'
const RANK = { none: 0, basic: 1, standard: 2, advanced: 3 }
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => ({
    featureTier: () => tier,
    hasTier: (_k, min) => RANK[tier] >= RANK[min],
    tenant: { planName: 'Silver' },
  }),
}))
const q = vi.hoisted(() => ({ useReports: vi.fn(), useForecast: vi.fn() }))
vi.mock('@/hooks/queries/adminQueries', () => q)
vi.mock('@/Pages/Admin/components/charts/LineChart', () => ({ default: () => null }))

import BusinessReportModal from '@/Pages/Admin/components/BusinessReportModal'

beforeEach(() => {
  q.useReports.mockReset().mockReturnValue({ data: undefined, isFetching: false })
  q.useForecast.mockReset().mockReturnValue({ data: undefined })
})

const open = () => render(<BusinessReportModal isOpen onClose={() => {}} branchId="all" />)

describe('BusinessReportModal — revenue analytics levels', () => {
  test('no analytics in the plan → locked notice, nothing fetched', () => {
    tier = 'none'
    open()
    expect(screen.getByTestId('report-locked')).toHaveTextContent('Silver')
    expect(q.useReports).toHaveBeenCalledWith(expect.anything(), { enabled: false })
    expect(q.useForecast).toHaveBeenCalledWith(expect.anything(), { enabled: false })
  })

  test('basic → reports on, forecast off, "This year" preset locked', () => {
    tier = 'basic'
    open()
    expect(screen.getByTestId('report-basic-note')).toHaveTextContent('31 days')
    expect(q.useReports).toHaveBeenCalledWith(expect.anything(), { enabled: true })
    expect(q.useForecast).toHaveBeenCalledWith(expect.anything(), { enabled: false })
    expect(screen.getByRole('button', { name: /This year/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Today$/ })).not.toBeDisabled()
  })

  test('standard → every preset, forecast shown as an upgrade', () => {
    tier = 'standard'
    open()
    expect(screen.getByRole('button', { name: /This year/ })).not.toBeDisabled()
    expect(screen.getByTestId('forecast-locked')).toBeInTheDocument()
    expect(q.useForecast).toHaveBeenCalledWith(expect.anything(), { enabled: false })
  })

  test('advanced → forecast fetched, no upgrade notes', () => {
    tier = 'advanced'
    open()
    expect(q.useForecast).toHaveBeenCalledWith(expect.anything(), { enabled: true })
    expect(screen.queryByTestId('forecast-locked')).not.toBeInTheDocument()
    expect(screen.queryByTestId('report-basic-note')).not.toBeInTheDocument()
  })
})
