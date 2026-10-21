/**
 * Loggedin/ScanTable — the `/scan` "scan your table" prompt in a
 * token-number restaurant (§12.2): there is no table to scan, so the
 * screen offers the tableless dine-in entry instead of a dead end.
 * Default tenants keep today's prompt.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }))
vi.mock('@/utils/api', () => ({ default: { get: vi.fn() } }))

import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'
import ScanTable from '@/Pages/Loggedin/ScanTable'

function renderScan(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/scan', state }]}>
      <Routes>
        <Route path="/scan" element={<ScanTable />} />
        <Route path="/customer/home" element={<div>home-page</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => clearActiveTenant())

describe('ScanTable — /scan prompt', () => {
  test('default tenant: scan-your-table prompt, keep-browsing button, no tableless entry', async () => {
    setActiveTenant({ slug: 'cafe' })
    const user = renderScan()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Scan your table to order')
    await user.click(screen.getByRole('button', { name: 'Keep browsing the menu' }))
    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(localStorage.getItem('dineInEntry')).toBeNull()
  })

  test('table removed reason keeps its wording for a table restaurant', () => {
    renderScan({ reason: 'table_removed' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('This table is no longer available')
  })

  test('token-number restaurant: "No table needed here" and Continue stamps the tableless entry', async () => {
    setActiveTenant({ slug: 'counter-cafe', operations: { tables: { useTables: false } } })
    localStorage.setItem('orderType', 'takeaway')
    const user = renderScan({ reason: 'no_table' })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('No table needed here')
    expect(screen.getByText(/token numbers/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to the menu' }))
    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('dineInEntry'))).toEqual({ dineIn: true, tableless: true })
    expect(localStorage.getItem('orderType')).toBe('dine-in')
  })
})
